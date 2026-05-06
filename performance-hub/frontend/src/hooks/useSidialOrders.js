import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';

const ORDERS_TIMEOUT_MS = 90000;

function readCache(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function useSidialOrders(dateFrom, dateTo, includeUnattributed = false) {
  const cacheKey = `ph:v2:sidial:orders:${dateFrom || ''}:${dateTo || ''}:includeUnattributed=${includeUnattributed ? '1' : '0'}`;
  const cached = readCache(cacheKey);

  const [orders, setOrders] = useState(cached?.data || []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fetchedAt, setFetchedAt] = useState(cached?.fetchedAt ? new Date(cached.fetchedAt) : null);
  const [lastSyncAt, setLastSyncAt] = useState(cached?.lastSyncAt ? new Date(cached.lastSyncAt) : null);
  const [syncStatus, setSyncStatus] = useState(cached?.syncStatus || null);
  const [syncMeta, setSyncMeta] = useState(cached?.syncMeta || null);

  const fetch = useCallback(async (options = {}) => {
    const { force = false, forceSync = false } = options;
    if (!dateFrom || !dateTo) return;

    if (forceSync) {
      try {
        const trigger = await api.post('/sidial/orders/sync', {
          dateFrom,
          dateTo,
          includeUnattributed: includeUnattributed ? 1 : 0
        });
        setSyncStatus('syncing');
        setSyncMeta(trigger.data?.syncMeta || { phase: 'orders_live_sync' });
      } catch {
        // Non bloccare la UX: anche se trigger fallisce, proviamo comunque a leggere cache.
      }
    }

    if (!force) {
      const existing = readCache(cacheKey);
      if (existing?.data) {
        setOrders(existing.data);
        setFetchedAt(existing.fetchedAt ? new Date(existing.fetchedAt) : null);
        setLastSyncAt(existing.lastSyncAt ? new Date(existing.lastSyncAt) : null);
        setSyncStatus(existing.syncStatus || null);
        setSyncMeta(existing.syncMeta || null);
        setError(null);
        return;
      }
    }

    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/sidial/orders', {
        params: {
          dateFrom,
          dateTo,
          forceSync: 0,
          includeUnattributed: includeUnattributed ? 1 : 0
        },
        timeout: ORDERS_TIMEOUT_MS
      });
      const data = res.data.data || [];
      const now = new Date();
      const syncAt = res.data.lastSyncAt ? new Date(res.data.lastSyncAt) : null;
      const status = res.data.syncStatus || null;
      const meta = res.data.syncMeta || null;

      setOrders(data);
      setFetchedAt(now);
      setLastSyncAt(syncAt);
      setSyncStatus(status);
      setSyncMeta(meta);
      writeCache(cacheKey, {
        data,
        fetchedAt: now.toISOString(),
        lastSyncAt: syncAt ? syncAt.toISOString() : null,
        syncStatus: status,
        syncMeta: meta
      });
    } catch (e) {
      const existing = readCache(cacheKey);
      const isTimeout = String(e?.message || '').toLowerCase().includes('timeout');
      if (isTimeout && existing?.data) {
        setOrders(existing.data);
        setFetchedAt(existing.fetchedAt ? new Date(existing.fetchedAt) : null);
        setLastSyncAt(existing.lastSyncAt ? new Date(existing.lastSyncAt) : null);
        setSyncStatus(existing.syncStatus || syncStatus || null);
        setSyncMeta(existing.syncMeta || syncMeta || null);
        setError(null);
      } else {
        setError(e.message);
      }
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, cacheKey, includeUnattributed, syncMeta, syncStatus]);

  useEffect(() => { fetch(); }, [fetch]);

  const refetch = useCallback((options = {}) => fetch({ force: true, ...options }), [fetch]);
  return {
    orders, loading, error, fetchedAt, lastSyncAt, syncStatus, syncMeta, refetch
  };
}
