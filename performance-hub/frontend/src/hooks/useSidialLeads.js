import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';

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

export function useSidialLeads(dateFrom, dateTo, type) {
  const cacheKey = `ph:sidial:leads:${type || 'all'}:${dateFrom || ''}:${dateTo || ''}`;
  const cached = readCache(cacheKey);

  const [leads, setLeads] = useState(cached?.data || []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetch = useCallback(async (options = {}) => {
    const { force = false, forceSync = false } = options;
    if (!dateFrom || !dateTo) return;

    if (!force) {
      const existing = readCache(cacheKey);
      if (existing?.data) {
        setLeads(existing.data);
        setError(null);
        return;
      }
    }

    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/sidial/leads', { params: { dateFrom, dateTo, type, forceSync: forceSync ? 1 : 0 } });
      const data = res.data.data || [];
      setLeads(data);
      writeCache(cacheKey, { data, fetchedAt: new Date().toISOString() });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, type, cacheKey]);

  useEffect(() => { fetch(); }, [fetch]);

  const refetch = useCallback((options = {}) => fetch({ force: true, ...options }), [fetch]);
  return { leads, loading, error, refetch };
}
