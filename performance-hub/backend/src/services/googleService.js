import axios from 'axios';
import { matchCampaignAttribution } from './campaignConfigService.js';
import {
  marketingStoreEnabled,
  getMarketingSyncState,
  upsertMarketingSyncState,
  getMarketingCachedInsights,
  upsertMarketingCachedInsights,
  insertMarketingDailySnapshots
} from './marketingStoreService.js';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const MARKETING_SYNC_INTERVAL_MINUTES = Number(process.env.MARKETING_SYNC_INTERVAL_MINUTES || 15);

let cachedToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    grant_type: 'refresh_token'
  });

  const response = await axios.post(TOKEN_URL, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  cachedToken = response.data.access_token;
  tokenExpiresAt = Date.now() + (response.data.expires_in - 60) * 1000;
  return cachedToken;
}

function todayDateString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function rangeIncludesToday(dateFrom, dateTo) {
  const today = todayDateString();
  return String(dateFrom || '') <= today && String(dateTo || '') >= today;
}

function isFresh(syncState, includesToday) {
  if (!syncState || syncState.status !== 'ok' || !syncState.last_sync_at) return false;
  if (!includesToday) return true;
  const ts = new Date(syncState.last_sync_at).getTime();
  if (Number.isNaN(ts)) return false;
  const ageMs = Date.now() - ts;
  return ageMs <= Math.max(1, MARKETING_SYNC_INTERVAL_MINUTES) * 60 * 1000;
}

async function fetchGoogleInsightsLive(dateFrom, dateTo) {
  const apiVersion = process.env.GOOGLE_ADS_API_VERSION || 'v22';
  const GOOGLE_ADS_BASE = `https://googleads.googleapis.com/${apiVersion}`;
  const customerId = String(process.env.GOOGLE_CUSTOMER_ID || '').replaceAll('-', '').trim();
  const developerToken = process.env.GOOGLE_DEVELOPER_TOKEN;
  const loginCustomerIdRaw = process.env.GOOGLE_LOGIN_CUSTOMER_ID || '';
  const loginCustomerId = String(loginCustomerIdRaw).replaceAll('-', '').trim();

  if (!customerId || !developerToken || !process.env.GOOGLE_REFRESH_TOKEN) {
    throw Object.assign(
      new Error('Credenziali Google Ads non configurate. Aggiorna il file .env.'),
      { status: 503, code: 'GOOGLE_NOT_CONFIGURED' }
    );
  }

  let accessToken;
  try {
    accessToken = await getAccessToken();
  } catch (err) {
    throw Object.assign(
      new Error('Impossibile ottenere token Google: ' + err.message),
      { status: 401, code: 'GOOGLE_TOKEN_ERROR' }
    );
  }

  const query = `
    SELECT
      segments.date,
      campaign.id,
      campaign.name,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions
    FROM campaign
    WHERE segments.date BETWEEN '${dateFrom}' AND '${dateTo}'
    ORDER BY segments.date ASC
  `;

  let response;
  try {
    response = await axios.post(
      `${GOOGLE_ADS_BASE}/customers/${customerId}/googleAds:searchStream`,
      { query },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'developer-token': developerToken,
          ...(loginCustomerId ? { 'login-customer-id': loginCustomerId } : {}),
          'Content-Type': 'application/json'
        }
      }
    );
  } catch (err) {
    const gErr = err.response?.data;
    if (err.response?.status === 401) {
      cachedToken = null;
      throw Object.assign(
        new Error('Token Google non valido o scaduto. Controlla le credenziali.'),
        { status: 401, code: 'GOOGLE_TOKEN_EXPIRED' }
      );
    }
    throw Object.assign(
      new Error('Errore Google Ads API: ' + JSON.stringify(gErr || err.message)),
      { status: 502, code: 'GOOGLE_API_ERROR' }
    );
  }

  const batches = Array.isArray(response.data) ? response.data : [response.data];
  const daily = [];
  const campaigns = [];
  const attributionBreakdownMap = new Map();

  for (const batch of batches) {
    for (const result of (batch.results || [])) {
      const campaignName = result.campaign?.name || '';
      const attribution = await matchCampaignAttribution('google', campaignName);
      const clientId = attribution.clientId || null;
      const spend = parseFloat(((result.metrics?.costMicros || 0) / 1000000).toFixed(2));
      const impressions = parseInt(result.metrics?.impressions) || 0;
      const clicks = parseInt(result.metrics?.clicks) || 0;
      const leads = Math.round(parseFloat(result.metrics?.conversions) || 0);
      const date = result.segments?.date || '';
      const campaignId = String(result.campaign?.id || '');

      daily.push({
        date,
        campaignId,
        campaignName,
        clientId,
        crmCampaignId: attribution.campaignId || null,
        crmCampaignName: attribution.crmCampaignName || null,
        source: 'google',
        internalCampaignName: attribution.internalCampaignName || null,
        spend,
        impressions,
        clicks,
        leads
      });

      campaigns.push({
        date,
        campaignId,
        campaignName,
        clientId,
        crmCampaignId: attribution.campaignId || null,
        crmCampaignName: attribution.crmCampaignName || null,
        internalCampaignName: attribution.internalCampaignName || null,
        spend,
        impressions,
        clicks,
        leads
      });

      if (clientId) {
        const prev = attributionBreakdownMap.get(clientId) || { spend: 0, impressions: 0, clicks: 0, leads: 0 };
        prev.spend += spend;
        prev.impressions += impressions;
        prev.clicks += clicks;
        prev.leads += leads;
        attributionBreakdownMap.set(clientId, prev);
      }
    }
  }

  const totals = daily.reduce((acc, d) => ({
    spend: acc.spend + d.spend,
    impressions: acc.impressions + d.impressions,
    clicks: acc.clicks + d.clicks,
    leads: acc.leads + d.leads
  }), { spend: 0, impressions: 0, clicks: 0, leads: 0 });

  const attributionBreakdown = Object.fromEntries(
    Array.from(attributionBreakdownMap.entries()).map(([clientId, values]) => ([
      clientId,
      {
        spend: parseFloat(values.spend.toFixed(2)),
        impressions: values.impressions,
        clicks: values.clicks,
        leads: values.leads,
        cpl: values.leads > 0 ? parseFloat((values.spend / values.leads).toFixed(2)) : 0,
        ctr: values.impressions > 0 ? parseFloat(((values.clicks / values.impressions) * 100).toFixed(2)) : 0
      }
    ]))
  );

  const brandBreakdown = attributionBreakdown;

  return {
    spend: parseFloat(totals.spend.toFixed(2)),
    impressions: totals.impressions,
    clicks: totals.clicks,
    leads: totals.leads,
    cpl: totals.leads > 0
      ? parseFloat((totals.spend / totals.leads).toFixed(2))
      : 0,
    ctr: totals.impressions > 0
      ? parseFloat(((totals.clicks / totals.impressions) * 100).toFixed(2))
      : 0,
    daily,
    campaigns,
    brandBreakdown,
    attributionBreakdown
  };
}

export async function getInsights(dateFrom, dateTo) {
  const channel = 'google';
  const cacheKey = `${channel}:${dateFrom}:${dateTo}`;
  const includesToday = rangeIncludesToday(dateFrom, dateTo);

  if (marketingStoreEnabled()) {
    try {
      const sync = await getMarketingSyncState(cacheKey);
      if (isFresh(sync, includesToday)) {
        const cached = await getMarketingCachedInsights(channel, dateFrom, dateTo);
        if (cached?.payload) return cached.payload;
      }
    } catch {
      // fallback live
    }
  }

  try {
    const data = await fetchGoogleInsightsLive(dateFrom, dateTo);

    if (marketingStoreEnabled()) {
      await upsertMarketingCachedInsights(channel, dateFrom, dateTo, data);
      await upsertMarketingSyncState(cacheKey, channel, {
        status: 'ok',
        rowsCount: data.daily?.length || 0,
        meta: { dateFrom, dateTo }
      });
      await insertMarketingDailySnapshots(channel, data.campaigns || []);
    }

    return data;
  } catch (err) {
    if (marketingStoreEnabled()) {
      try {
        const cached = await getMarketingCachedInsights(channel, dateFrom, dateTo);
        if (cached?.payload) {
          await upsertMarketingSyncState(cacheKey, channel, {
            status: 'error',
            rowsCount: cached.payload?.daily?.length || 0,
            message: err.message,
            meta: { dateFrom, dateTo, staleFallback: true }
          });
          return cached.payload;
        }
      } catch {
        // ignore fallback errors
      }
    }
    throw err;
  }
}

export async function warmGoogleInsights({ dateFrom, dateTo }) {
  return getInsights(dateFrom, dateTo);
}
