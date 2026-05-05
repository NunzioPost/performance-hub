import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';

function readCache(key) {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function useGoogleInsights(dateFrom, dateTo) {
  const cacheKey = `ph:google:insights:${dateFrom || ''}:${dateTo || ''}`;
  const cached = readCache(cacheKey);

  const [insights, setInsights] = useState(cached?.data || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fetchedAt, setFetchedAt] = useState(cached?.fetchedAt ? new Date(cached.fetchedAt) : null);

  const fetch = useCallback(async (options = {}) => {
    const { force = false } = options;
    if (!dateFrom || !dateTo) return;

    if (!force) {
      const existing = readCache(cacheKey);
      if (existing?.data) {
        setInsights(existing.data);
        setFetchedAt(existing.fetchedAt ? new Date(existing.fetchedAt) : null);
        setError(null);
        return;
      }
    }

    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/google/insights', { params: { dateFrom, dateTo } });
      const data = res.data.data;
      const now = new Date();
      setInsights(data);
      setFetchedAt(now);
      writeCache(cacheKey, { data, fetchedAt: now.toISOString() });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, cacheKey]);

  useEffect(() => { fetch(); }, [fetch]);

  const refetch = useCallback(() => fetch({ force: true }), [fetch]);
  return { insights, loading, error, fetchedAt, refetch };
}
