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

const GRAPH_BASE = 'https://graph.facebook.com/v19.0';
const MARKETING_SYNC_INTERVAL_MINUTES = Number(process.env.MARKETING_SYNC_INTERVAL_MINUTES || 15);

function parseMetaAccounts(rawValue) {
  const parts = String(rawValue || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  const normalized = parts.map((id) => (id.startsWith('act_') ? id : `act_${id}`));
  return [...new Set(normalized)];
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

async function fetchMetaInsightsLive(dateFrom, dateTo) {
  const accountIds = parseMetaAccounts(process.env.META_AD_ACCOUNT_ID);
  const accessToken = process.env.META_ACCESS_TOKEN;

  if (accountIds.length === 0 || !accessToken) {
    throw Object.assign(
      new Error('Credenziali Meta non configurate. Aggiorna il file .env.'),
      { status: 503, code: 'META_NOT_CONFIGURED' }
    );
  }

  const params = {
    access_token: accessToken,
    time_range: JSON.stringify({ since: dateFrom, until: dateTo }),
    fields: 'campaign_id,campaign_name,spend,impressions,clicks,actions,cost_per_action_type,date_start,date_stop',
    time_increment: '1',
    level: 'campaign',
    limit: 500
  };

  const rows = [];

  for (const accountId of accountIds) {
    let response;
    try {
      response = await axios.get(`${GRAPH_BASE}/${accountId}/insights`, { params });
    } catch (err) {
      const fbErr = err.response?.data?.error;
      if (fbErr?.code === 190) {
        throw Object.assign(
          new Error('Token Meta scaduto. Vai su Impostazioni e rinnova il token.'),
          { status: 401, code: 'META_TOKEN_EXPIRED' }
        );
      }
      throw Object.assign(
        new Error(`Errore Meta API su ${accountId}: ` + (fbErr?.message || err.message)),
        { status: 502, code: 'META_API_ERROR' }
      );
    }

    const data = Array.isArray(response.data?.data) ? response.data.data : [];
    for (const item of data) {
      const actionsArr = Array.isArray(item.actions) ? item.actions : [];
      const leadAction = actionsArr.find((a) => a.action_type === 'lead');
      const leads = leadAction ? parseInt(leadAction.value) || 0 : 0;

      const spend = parseFloat(item.spend) || 0;
      const impressions = parseInt(item.impressions) || 0;
      const clicks = parseInt(item.clicks) || 0;
      const campaignName = item.campaign_name || '';
      const attribution = await matchCampaignAttribution('meta', campaignName);

      rows.push({
        date: item.date_start,
        campaignId: String(item.campaign_id || ''),
        campaignName,
        clientId: attribution.clientId || null,
        crmCampaignId: attribution.campaignId || null,
        crmCampaignName: attribution.crmCampaignName || null,
        internalCampaignName: attribution.internalCampaignName || null,
        source: 'meta',
        spend,
        impressions,
        clicks,
        leads
      });
    }
  }

  const dailyMap = new Map();
  const attributionMap = new Map();

  for (const row of rows) {
    const prevDay = dailyMap.get(row.date) || {
      date: row.date,
      spend: 0,
      impressions: 0,
      clicks: 0,
      leads: 0
    };
    prevDay.spend += row.spend;
    prevDay.impressions += row.impressions;
    prevDay.clicks += row.clicks;
    prevDay.leads += row.leads;
    dailyMap.set(row.date, prevDay);

    if (row.clientId) {
      const prevClient = attributionMap.get(row.clientId) || {
        spend: 0,
        impressions: 0,
        clicks: 0,
        leads: 0
      };
      prevClient.spend += row.spend;
      prevClient.impressions += row.impressions;
      prevClient.clicks += row.clicks;
      prevClient.leads += row.leads;
      attributionMap.set(row.clientId, prevClient);
    }
  }

  const daily = Array.from(dailyMap.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({
      ...d,
      spend: parseFloat(d.spend.toFixed(2)),
      cpl: d.leads > 0 ? parseFloat((d.spend / d.leads).toFixed(2)) : 0
    }));

  const totals = daily.reduce((acc, d) => ({
    spend: acc.spend + d.spend,
    impressions: acc.impressions + d.impressions,
    clicks: acc.clicks + d.clicks,
    leads: acc.leads + d.leads
  }), { spend: 0, impressions: 0, clicks: 0, leads: 0 });

  const attributionBreakdown = Object.fromEntries(
    Array.from(attributionMap.entries()).map(([clientId, values]) => ([
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
    attributionBreakdown,
    campaigns: rows
  };
}

export async function getInsights(dateFrom, dateTo) {
  const channel = 'meta';
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
      // fallback live API
    }
  }

  try {
    const data = await fetchMetaInsightsLive(dateFrom, dateTo);

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
        // ignore stale fallback errors
      }
    }
    throw err;
  }
}

export async function warmMetaInsights({ dateFrom, dateTo }) {
  return getInsights(dateFrom, dateTo);
}

export async function getTokenStatus() {
  const accessToken = process.env.META_ACCESS_TOKEN;
  if (!accessToken) return { valid: false, reason: 'Token non configurato' };

  try {
    const response = await axios.get(`${GRAPH_BASE}/me`, {
      params: { access_token: accessToken, fields: 'id,name' }
    });
    return { valid: true, name: response.data.name, id: response.data.id };
  } catch {
    return { valid: false, reason: 'Token non valido o scaduto' };
  }
}
