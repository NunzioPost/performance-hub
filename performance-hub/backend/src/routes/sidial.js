import { Router } from 'express';
import {
  searchLeads, getOrders, getOrderDetails, buildOrdersCacheKey, getSidialStatus, scheduleOrdersSync
} from '../services/sidialService.js';
import { getSidialPairsBySource } from '../services/campaignConfigService.js';
import {
  getSyncState,
  sidialStoreEnabled,
  getLeadsHistory,
  getLastSyncByPrefix,
  getOrdersByRange
} from '../services/sidialStoreService.js';

const router = Router();

// GET /api/sidial/token-status
router.get('/token-status', async (req, res, next) => {
  try {
    const status = await getSidialStatus();
    res.json(status);
  } catch (e) { next(e); }
});

// GET /api/sidial/leads?dateFrom=2024-01-01 00:00:00&dateTo=2024-01-31 23:59:59&type=google
// type: "google" | "meta"
router.get('/leads', async (req, res, next) => {
  try {
    const { dateFrom, dateTo, type, forceSync } = req.query;
    if (!dateFrom || !dateTo) return res.status(400).json({ error: true, message: 'dateFrom e dateTo sono obbligatori' });
    if (!type || !['google', 'meta'].includes(String(type).toLowerCase())) {
      return res.status(400).json({ error: true, message: 'type deve essere google o meta' });
    }

    const source = String(type).toLowerCase();
    const pairs = await getSidialPairsBySource(source);
    if (pairs.length === 0) {
      return res.status(400).json({
        error: true,
        message: `Nessuna mappatura SIDIAL configurata per source=${source}`
      });
    }

    const leads = await searchLeads(pairs, dateFrom, dateTo, {
      forceSync: String(forceSync || '') === '1'
    });
    res.json({ success: true, count: leads.length, data: leads });
  } catch (e) { next(e); }
});

// GET /api/sidial/orders?dateFrom=2024-01-01 00:00:00&dateTo=2024-01-31 23:59:59
router.get('/orders', async (req, res, next) => {
  try {
    const { dateFrom, dateTo, includeUnattributed, forceSync } = req.query;
    if (!dateFrom || !dateTo) return res.status(400).json({ error: true, message: 'dateFrom e dateTo sono obbligatori' });

    const includeUnattr = String(includeUnattributed || '') === '1';
    const manualSync = String(forceSync || '') === '1';
    let syncQueued = false;
    let syncRunning = false;

    // SWR: non bloccare la risposta utente su sync pesanti.
    if (manualSync) {
      const state = scheduleOrdersSync(dateFrom, dateTo, { includeUnattributed: includeUnattr });
      syncQueued = state.queued;
      syncRunning = state.running;
    }

    const orders = await getOrders(dateFrom, dateTo, {
      includeUnattributed: includeUnattr,
      forceSync: false,
      cacheOnly: true
    });

    let lastSyncAt = null;
    let syncStatus = null;
    let syncMeta = null;
    if (sidialStoreEnabled()) {
      const sync = await getSyncState(buildOrdersCacheKey(dateFrom, dateTo, includeUnattr));
      lastSyncAt = sync?.last_sync_at || null;
      syncStatus = sync?.status || null;
      syncMeta = sync?.meta || null;
    }

    res.json({
      success: true,
      count: orders.length,
      lastSyncAt,
      syncStatus,
      syncMeta,
      syncQueued,
      syncRunning,
      data: orders
    });
  } catch (e) { next(e); }
});

// POST /api/sidial/orders/enrich
// Body: { orderId: "12345" }
router.post('/orders/enrich', async (req, res, next) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ error: true, message: 'orderId obbligatorio' });

    const details = await getOrderDetails(orderId);
    res.json({ success: true, orderId, data: details });
  } catch (e) { next(e); }
});

// POST /api/sidial/orders/enrich-batch
// Body: { orderIds: ["123","456"], concurrency?: 4 }
router.post('/orders/enrich-batch', async (req, res, next) => {
  try {
    const orderIds = Array.isArray(req.body?.orderIds) ? req.body.orderIds : [];
    const unique = Array.from(new Set(orderIds.map((x) => String(x || '').trim()).filter(Boolean)));
    if (unique.length === 0) {
      return res.status(400).json({ error: true, message: 'orderIds obbligatorio (array non vuoto)' });
    }

    const concurrency = Math.max(1, Number(req.body?.concurrency || 4));
    let done = 0;
    let ok = 0;
    let failed = 0;

    for (let i = 0; i < unique.length; i += concurrency) {
      const chunk = unique.slice(i, i + concurrency);
      const results = await Promise.allSettled(chunk.map((id) => getOrderDetails(id)));
      results.forEach((r) => {
        done += 1;
        if (r.status === 'fulfilled') ok += 1;
        else failed += 1;
      });
    }

    res.json({ success: true, total: unique.length, done, ok, failed });
  } catch (e) { next(e); }
});

// GET /api/sidial/history/leads?dateFrom=...&dateTo=...&type=google|meta
// Legge solo dallo storico DB, nessuna chiamata live SIDIAL
router.get('/history/leads', async (req, res, next) => {
  try {
    const { dateFrom, dateTo, type } = req.query;
    if (!dateFrom || !dateTo) {
      return res.status(400).json({ error: true, message: 'dateFrom e dateTo sono obbligatori' });
    }
    if (!sidialStoreEnabled()) {
      return res.status(503).json({ error: true, message: 'Storico SIDIAL non disponibile: abilita SIDIAL_PERSISTENCE=db' });
    }

    const source = type ? String(type).toLowerCase() : null;
    if (source && !['google', 'meta'].includes(source)) {
      return res.status(400).json({ error: true, message: 'type deve essere google o meta' });
    }

    const data = await getLeadsHistory({ dateFrom, dateTo, source });
    const lastSyncAt = await getLastSyncByPrefix('leads:');
    res.json({ success: true, count: data.length, lastSyncAt, data });
  } catch (e) { next(e); }
});

// GET /api/sidial/history/orders?dateFrom=...&dateTo=...&includeUnattributed=1
// Legge solo dallo storico DB, nessuna chiamata live SIDIAL
router.get('/history/orders', async (req, res, next) => {
  try {
    const { dateFrom, dateTo, includeUnattributed } = req.query;
    if (!dateFrom || !dateTo) {
      return res.status(400).json({ error: true, message: 'dateFrom e dateTo sono obbligatori' });
    }
    if (!sidialStoreEnabled()) {
      return res.status(503).json({ error: true, message: 'Storico SIDIAL non disponibile: abilita SIDIAL_PERSISTENCE=db' });
    }

    const includeUnattr = String(includeUnattributed || '') === '1';
    const data = await getOrdersByRange({ dateFrom, dateTo, includeUnattributed: includeUnattr });
    const lastSyncAt = await getLastSyncByPrefix('orders:');
    res.json({ success: true, count: data.length, lastSyncAt, data });
  } catch (e) { next(e); }
});

export default router;
