import axios from 'axios';
import { deriveSidialOrderAttribution, getSidialPairsBySource } from './campaignConfigService.js';
import {
  sidialStoreEnabled,
  getSyncState,
  upsertSyncState,
  upsertLeads,
  getLeadsByRange,
  upsertOrders,
  getOrdersByRange,
  upsertOrderDetails
} from './sidialStoreService.js';

const orderAttributionCache = new Map();
const ON_DEMAND_ENRICH_MAX = Number(process.env.ORDERS_ON_DEMAND_ENRICH_MAX || 40);
const ON_DEMAND_ENRICH_CONCURRENCY = Number(process.env.ORDERS_ON_DEMAND_ENRICH_CONCURRENCY || 6);
const ORDERS_HISTORICAL_ENRICH_MAX = Number(process.env.ORDERS_HISTORICAL_ENRICH_MAX || 500);
const ORDERS_FORCE_SYNC_ENRICH_MAX = Number(process.env.ORDERS_FORCE_SYNC_ENRICH_MAX || 200);
const ORDERS_INLINE_ENRICH_BUDGET_MS = Number(process.env.ORDERS_INLINE_ENRICH_BUDGET_MS || 12000);
const ORDERS_FORCE_SYNC_INLINE_BUDGET_MS = Number(
  process.env.ORDERS_FORCE_SYNC_INLINE_BUDGET_MS || ORDERS_INLINE_ENRICH_BUDGET_MS
);
const SIDIAL_SYNC_INTERVAL_MINUTES = Number(process.env.SIDIAL_SYNC_INTERVAL_MINUTES || 18);
const SIDIAL_HTTP_TIMEOUT_MS = Number(process.env.SIDIAL_HTTP_TIMEOUT_MS || 15000);
const SIDIAL_DETAILS_HTTP_TIMEOUT_MS = Number(process.env.SIDIAL_DETAILS_HTTP_TIMEOUT_MS || 12000);
const ORDER_SERVICE_CANDIDATE_FIELDS = [
  'service',
  'services',
  'serviceDescription',
  'serviceDesc',
  'service_name',
  'serviceName',
  'productService',
  'product_service',
  'campaignDescription',
  'listDescription'
];

async function runInBatches(items, batchSize, worker) {
  const size = Math.max(1, Number(batchSize) || 1);
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    await Promise.allSettled(chunk.map(worker));
  }
}

async function enrichOrderDetailsWithBudget(orders, {
  maxOrders = 0,
  concurrency = ON_DEMAND_ENRICH_CONCURRENCY,
  budgetMs = ORDERS_INLINE_ENRICH_BUDGET_MS
} = {}) {
  const queue = orders
    .filter((o) => o?.id)
    .slice(0, Math.max(0, Number(maxOrders) || 0));

  if (queue.length === 0) return { processed: 0, exhausted: false };

  const startedAt = Date.now();
  const size = Math.max(1, Number(concurrency) || 1);
  let processed = 0;
  let exhausted = false;

  for (let i = 0; i < queue.length; i += size) {
    if (Date.now() - startedAt >= Math.max(0, Number(budgetMs) || 0)) {
      exhausted = true;
      break;
    }
    const chunk = queue.slice(i, i + size);
    await Promise.allSettled(chunk.map(async (order) => {
      await getOrderDetails(String(order.id));
    }));
    processed += chunk.length;
  }

  return { processed, exhausted };
}

function hasOrderAttribution(order) {
  return !!(order?.brand && order?.source);
}

function needsOrderDetails(order) {
  return !!(
    order?.id
    && String(order.details_loaded || '').toLowerCase() !== 'yes'
    && (!order.listName || !order.source || !order.brand)
  );
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function getAllowedOrderServices() {
  const raw = String(process.env.SIDIAL_ALLOWED_ORDER_SERVICES || '').trim();
  if (!raw) return ['vodafone outbound', 'wind proprie'];
  if (raw === '*' || raw.toLowerCase() === 'all') return [];
  return raw
    .split(',')
    .map((s) => normalizeText(s))
    .filter(Boolean);
}

function isOrderInAllowedServices(order, allowedServices) {
  if (!Array.isArray(allowedServices) || allowedServices.length === 0) return true;
  const mode = String(process.env.SIDIAL_ORDER_SERVICE_FILTER_MODE || 'contains').toLowerCase().trim();
  const values = ORDER_SERVICE_CANDIDATE_FIELDS
    .map((field) => normalizeText(order?.[field]))
    .filter(Boolean);

  if (values.length === 0) return true;

  if (mode === 'strict') {
    return values.some((val) => allowedServices.includes(val));
  }

  // default: contains (piu tollerante su varianti SIDIAL)
  return values.some((val) => {
    return allowedServices.some((allowed) => val.includes(allowed) || allowed.includes(val));
  });
}

function formatDateTime(date, isEnd = false) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d} ${isEnd ? '23:59:59' : '00:00:00'}`;
}

function todayDateString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function rangeIncludesToday(dateFrom, dateTo) {
  const from = String(dateFrom || '').slice(0, 10);
  const to = String(dateTo || '').slice(0, 10);
  const today = todayDateString();
  return from <= today && to >= today;
}

function isSyncFresh(syncState, includesToday) {
  if (!syncState || syncState.status !== 'ok' || !syncState.last_sync_at) return false;
  if (!includesToday) return true;
  const last = new Date(syncState.last_sync_at).getTime();
  if (Number.isNaN(last)) return false;
  const ageMs = Date.now() - last;
  return ageMs <= Math.max(1, SIDIAL_SYNC_INTERVAL_MINUTES) * 60 * 1000;
}

function getSidialConfig() {
  const baseUrl = String(process.env.SIDIAL_BASE_URL || '').trim();
  const apiToken = String(process.env.SIDIAL_API_TOKEN || '').trim();

  if (!baseUrl) {
    throw Object.assign(new Error('SIDIAL_BASE_URL non configurato nel file .env'), { status: 503, code: 'SIDIAL_NOT_CONFIGURED' });
  }
  try {
    // eslint-disable-next-line no-new
    new URL(baseUrl);
  } catch {
    throw Object.assign(new Error(`SIDIAL_BASE_URL non valido: ${baseUrl}`), { status: 503, code: 'SIDIAL_BASE_URL_INVALID' });
  }
  if (!apiToken) {
    throw Object.assign(new Error('SIDIAL_API_TOKEN non configurato nel file .env'), { status: 503, code: 'SIDIAL_NOT_CONFIGURED' });
  }

  return { baseUrl, apiToken };
}

export function buildOrdersCacheKey(dateFrom, dateTo, includeUnattributed = false) {
  return `orders:${dateFrom}:${dateTo}:includeUnattributed=${includeUnattributed ? '1' : '0'}`;
}

async function deriveOrderAttribution(fields = {}) {
  const rawList = fields.listName || fields.listDescription || fields.list || '';
  const mapped = await deriveSidialOrderAttribution(rawList);
  if (mapped.source && mapped.clientId) {
    return {
      source: mapped.source,
      brand: mapped.clientId,
      clientId: mapped.clientId,
      campaignId: mapped.campaignId || null,
      internalCampaignName: mapped.internalCampaignName || null
    };
  }
  return {
    source: null,
    brand: null,
    clientId: null,
    campaignId: null,
    internalCampaignName: null
  };
}

async function enrichOrdersWithAttribution(orders) {
  return Promise.all(orders.map(async (order) => {
    const key = String(order.id || '');
    const cached = key ? orderAttributionCache.get(key) : null;

    const derived = await deriveOrderAttribution({
      listName: cached?.listName || order.listName || order.listDescription,
      campaignName: cached?.campaignName || order.campaignName || order.campaignDescription,
      listDescription: order.listDescription,
      campaignDescription: order.campaignDescription,
      service: order.service,
      serviceDescription: order.serviceDescription,
      services: order.services,
      list: order.list,
      campaign: order.campaign
    });

    return {
      ...order,
      listName: cached?.listName || order.listName || order.listDescription || null,
      campaignName: cached?.campaignName || order.campaignName || order.campaignDescription || null,
      source: cached?.source || derived.source || null,
      brand: cached?.brand || derived.brand || null,
      clientId: cached?.clientId || derived.clientId || null,
      campaignId: cached?.campaignId || derived.campaignId || null,
      internalCampaignName: cached?.internalCampaignName || derived.internalCampaignName || null,
      details_loaded: order.details_loaded || (cached ? 'yes' : order.details_loaded)
    };
  }));
}

export async function searchLeads(campaignListPairs, dateFrom, dateTo) {
  const source = String(campaignListPairs?.[0]?.source || '').toLowerCase();
  const includesToday = rangeIncludesToday(dateFrom, dateTo);
  const cacheKey = `leads:${source}:${dateFrom}:${dateTo}`;

  if (sidialStoreEnabled()) {
    try {
      const sync = await getSyncState(cacheKey);
      if (isSyncFresh(sync, includesToday)) {
        return await getLeadsByRange({ source, dateFrom, dateTo });
      }
    } catch {
      // fallback live
    }
  }

  const { baseUrl, apiToken } = getSidialConfig();
  let allLeads = [];

  try {
    for (const pair of campaignListPairs) {
      const filters = [
        { field: 'campaign', value: pair.campaign },
        { field: 'list', value: pair.list },
        { field: 'createdWhen', operator: '>=', value: dateFrom },
        { field: 'createdWhen', operator: '<=', value: dateTo }
      ];

      const payload = new URLSearchParams({
        a: 'searchLeads',
        apiToken,
        params: JSON.stringify(filters)
      });

      let response;
      try {
        response = await axios.post(baseUrl, payload.toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: SIDIAL_HTTP_TIMEOUT_MS
        });
      } catch (err) {
        const status = err.response?.status;
        const body = typeof err.response?.data === 'string' ? err.response.data : JSON.stringify(err.response?.data || {});
        const msg = String(err.response?.data?.response?.message || body || err.message || '').toLowerCase();

        if (status === 404 && msg.includes('nessuna lead trovata')) continue;

        throw Object.assign(
          new Error('Errore Sidial lead: ' + (err.response?.data?.response?.message || err.message)),
          { status: 502, code: 'SIDIAL_API_ERROR' }
        );
      }

      const text = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
      if (text.trim() === 'token errata') {
        throw Object.assign(new Error('Token Sidial non valido'), { status: 401, code: 'SIDIAL_TOKEN_INVALID' });
      }

      const json = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
      if (json.response?.error === true) {
        const msg = String(json.response.message || '');
        if (msg.toLowerCase().includes('nessuna lead trovata')) continue;
        throw Object.assign(new Error('Errore Sidial: ' + msg), { status: 502, code: 'SIDIAL_API_ERROR' });
      }

      const leads = Array.isArray(json.results) ? json.results : [];
      allLeads = allLeads.concat(leads.map((l) => ({
        ...l,
        source: pair.source,
        campaignName: pair.campaignName || null,
        crmCampaignName: pair.crmCampaignName || null,
        listName: pair.listName || null,
        brand: pair.brand || null,
        clientId: pair.clientId || pair.brand || null,
        campaignId: pair.campaignId || null,
        internalCampaignName: pair.internalCampaignName || null,
        channel: pair.channel || pair.source || null
      })));
    }

    const map = new Map();
    allLeads.forEach((l) => { if (l.id) map.set(String(l.id), l); });
    const deduped = Array.from(map.values());

    if (sidialStoreEnabled()) {
      await upsertLeads(deduped);
      await upsertSyncState(cacheKey, {
        status: 'ok',
        rowsCount: deduped.length,
        meta: { source, dateFrom, dateTo }
      });
    }

    return deduped;
  } catch (err) {
    if (sidialStoreEnabled()) {
      try {
        const stale = await getLeadsByRange({ source, dateFrom, dateTo });
        if (stale.length > 0) {
          await upsertSyncState(cacheKey, {
            status: 'error',
            rowsCount: stale.length,
            message: err.message,
            meta: { source, dateFrom, dateTo, staleFallback: true }
          });
          return stale;
        }
      } catch {
        // ignore fallback errors
      }
    }
    throw err;
  }
}

export async function getOrders(dateFrom, dateTo, options = {}) {
  const { includeUnattributed = false, forceSync = false } = options;
  const includesToday = rangeIncludesToday(dateFrom, dateTo);
  const cacheKey = buildOrdersCacheKey(dateFrom, dateTo, includeUnattributed);
  const allowedServices = getAllowedOrderServices();

  if (sidialStoreEnabled() && !forceSync) {
    try {
      const sync = await getSyncState(cacheKey);
      const cachedAllRaw = await getOrdersByRange({ dateFrom, dateTo, includeUnattributed: true });
      const cachedAll = cachedAllRaw.filter((o) => isOrderInAllowedServices(o, allowedServices));
      const cached = includeUnattributed ? cachedAll : cachedAll.filter(hasOrderAttribution);

      if (!includesToday && !includeUnattributed && cachedAll.length > cached.length) {
        const pending = cachedAll
          .filter(needsOrderDetails)
          .slice(0, Math.max(1, ORDERS_HISTORICAL_ENRICH_MAX));

        if (pending.length > 0) {
          await enrichOrderDetailsWithBudget(pending, {
            maxOrders: pending.length,
            concurrency: ON_DEMAND_ENRICH_CONCURRENCY,
            budgetMs: ORDERS_INLINE_ENRICH_BUDGET_MS
          });
          const refreshedAll = await getOrdersByRange({ dateFrom, dateTo, includeUnattributed: true });
          const refreshed = refreshedAll.filter(hasOrderAttribution);
          if (sync?.status === 'ok' || refreshed.length > cached.length) return refreshed;
        }
      }

      if (sync?.status === 'ok' && (isSyncFresh(sync, includesToday) || !includesToday)) return cached;
      if (!includesToday && cached.length > 0 && sync?.status !== 'error') return cached;
    } catch {
      // fallback live
    }
  }

  const { baseUrl, apiToken } = getSidialConfig();
  const url = new URL(baseUrl);
  url.searchParams.set('a', 'getOrderList');
  url.searchParams.set('apiToken', apiToken);
  url.searchParams.set('dateFrom', dateFrom);
  url.searchParams.set('dateTo', dateTo);
  url.searchParams.set('services', 'punit_service_desc_70928');

  try {
    const response = await axios.get(url.toString(), {
      timeout: SIDIAL_HTTP_TIMEOUT_MS
    });

    const text = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    if (text.trim() === 'token errata') {
      throw Object.assign(new Error('Token Sidial non valido'), { status: 401, code: 'SIDIAL_TOKEN_INVALID' });
    }

    const json = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    if (json?.response?.error === true) {
      throw Object.assign(
        new Error('Errore Sidial ordini: ' + (json.response.message || 'sconosciuto')),
        { status: 502 }
      );
    }

    let orders = [];
    if (Array.isArray(json)) orders = json;
    else if (Array.isArray(json.results)) orders = json.results;
    else if (Array.isArray(json.orders)) orders = json.orders;

    const filtered = orders
      .map((order) => ({
      ...order,
      createdWhen: order.createdWhen || order.createWhen || order.date || null
      }))
      .filter((order) => isOrderInAllowedServices(order, allowedServices));

    let enriched = await enrichOrdersWithAttribution(filtered);

    if (!includeUnattributed) {
      const hydrateLimit = forceSync
        ? Math.max(1, ORDERS_FORCE_SYNC_ENRICH_MAX)
        : includesToday
          ? Math.max(0, ON_DEMAND_ENRICH_MAX)
          : Math.max(1, ORDERS_HISTORICAL_ENRICH_MAX);
      const toHydrate = enriched
        .filter(needsOrderDetails)
        .slice(0, hydrateLimit);

      if (toHydrate.length > 0) {
        await enrichOrderDetailsWithBudget(toHydrate, {
          maxOrders: toHydrate.length,
          concurrency: ON_DEMAND_ENRICH_CONCURRENCY,
          budgetMs: forceSync ? ORDERS_FORCE_SYNC_INLINE_BUDGET_MS : ORDERS_INLINE_ENRICH_BUDGET_MS
        });
        enriched = await enrichOrdersWithAttribution(filtered);
      }
    }

    if (sidialStoreEnabled()) {
      await upsertOrders(enriched);
      await upsertSyncState(cacheKey, {
        status: 'ok',
        rowsCount: enriched.length,
        meta: { dateFrom, dateTo, includeUnattributed }
      });
    }

    if (includeUnattributed) return enriched;
    return enriched.filter(hasOrderAttribution);
  } catch (err) {
    if (sidialStoreEnabled()) {
      try {
        const stale = await getOrdersByRange({ dateFrom, dateTo, includeUnattributed });
        if (stale.length > 0) {
          await upsertSyncState(cacheKey, {
            status: 'error',
            rowsCount: stale.length,
            message: err.message,
            meta: { dateFrom, dateTo, includeUnattributed, staleFallback: true }
          });
          return stale;
        }
      } catch {
        // ignore
      }
    }
    throw err;
  }
}

export async function getOrderDetails(orderId) {
  const { baseUrl, apiToken } = getSidialConfig();
  const url = new URL(baseUrl);
  url.searchParams.set('a', 'getOrderDetailsWithLabels');
  url.searchParams.set('apiToken', apiToken);
  url.searchParams.set('id', orderId);

  const response = await axios.get(url.toString(), {
    timeout: SIDIAL_DETAILS_HTTP_TIMEOUT_MS
  });

  const text = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
  if (text.trim() === 'token errata') {
    throw Object.assign(new Error('Token Sidial non valido'), { status: 401 });
  }

  const json = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
  if (json?.response?.error === true) {
    throw Object.assign(new Error('Errore dettagli ordine ' + orderId), { status: 502 });
  }

  const header = json?.headerData || {};
  const listName = header.Lista || null;
  const campaignName = header.Campagna || null;
  const derived = await deriveOrderAttribution({ listName, campaignName });

  orderAttributionCache.set(String(orderId), {
    listName,
    campaignName,
    source: derived.source,
    brand: derived.brand,
    clientId: derived.clientId || null,
    campaignId: derived.campaignId || null,
    internalCampaignName: derived.internalCampaignName || null
  });

  if (sidialStoreEnabled()) {
    await upsertOrderDetails({
      orderId: String(orderId),
      detailsPayload: json,
      listName,
      campaignName,
      source: derived.source,
      clientId: derived.clientId,
      campaignId: derived.campaignId,
      internalCampaignName: derived.internalCampaignName
    });
  }

  return json;
}

export async function autoEnrichOrders({ daysBack = 3, maxOrders = 200, logger = console } = {}) {
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - Math.max(0, Number(daysBack) || 0));

  const dateFrom = formatDateTime(from, false);
  const dateTo = formatDateTime(now, true);

  const orders = await getOrders(dateFrom, dateTo, { includeUnattributed: true, forceSync: true });
  const pending = orders
    .filter((o) => o?.id && o.details_loaded !== 'yes')
    .slice(0, Math.max(1, Number(maxOrders) || 1));

  let ok = 0;
  let fail = 0;

  for (const order of pending) {
    try {
      await getOrderDetails(String(order.id));
      ok += 1;
    } catch (err) {
      fail += 1;
      logger.warn?.(`[AUTO-ENRICH] ordine ${order.id} fallito: ${err.message}`);
    }
  }

  return { scanned: orders.length, pending: pending.length, enriched: ok, failed: fail, dateFrom, dateTo };
}

export async function warmSidialCache({ logger = console } = {}) {
  const now = new Date();
  const dateFrom = formatDateTime(now, false);
  const dateTo = formatDateTime(now, true);
  const summary = { dateFrom, dateTo, leads: {}, orders: 0 };

  for (const source of ['google', 'meta']) {
    try {
      const pairs = await getSidialPairsBySource(source);
      if (pairs.length === 0) {
        summary.leads[source] = 0;
        continue;
      }
      const leads = await searchLeads(pairs, dateFrom, dateTo);
      summary.leads[source] = leads.length;
    } catch (err) {
      summary.leads[source] = -1;
      logger.warn?.(`[SIDIAL-WARMUP] lead ${source} errore: ${err.message}`);
    }
  }

  try {
    const orders = await getOrders(dateFrom, dateTo, { includeUnattributed: false, forceSync: true });
    summary.orders = orders.length;
  } catch (err) {
    summary.orders = -1;
    logger.warn?.(`[SIDIAL-WARMUP] ordini errore: ${err.message}`);
  }

  return summary;
}

export async function getSidialStatus() {
  try {
    const { baseUrl } = getSidialConfig();
    return { valid: true, configured: true, baseUrl };
  } catch (err) {
    return { valid: false, configured: false, reason: err.message };
  }
}
