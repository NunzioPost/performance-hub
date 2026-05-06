import { useCallback, useEffect, useState } from 'react';
import api from '../lib/api';
import { scopedKey } from '../lib/cacheScope';
import { DEFAULT_UI_SECTIONS, normalizeSections } from '../lib/sectionsAccess';

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

export function useUiSectionsConfig() {
  const cacheKey = scopedKey('ph:ui-sections:v1');
  const cached = readCache(cacheKey);

  const [sections, setSections] = useState(() => normalizeSections(cached?.sections || DEFAULT_UI_SECTIONS));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/config/ui-sections');
      const next = normalizeSections(res.data?.data?.sections || DEFAULT_UI_SECTIONS);
      setSections(next);
      writeCache(cacheKey, { sections: next, fetchedAt: new Date().toISOString() });
    } catch (e) {
      const existing = readCache(cacheKey);
      if (existing?.sections) {
        setSections(normalizeSections(existing.sections));
      } else {
        setSections(normalizeSections(DEFAULT_UI_SECTIONS));
      }
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [cacheKey]);

  const save = useCallback(async (nextSections) => {
    setSaving(true);
    setError(null);
    try {
      const payload = { sections: normalizeSections(nextSections) };
      const res = await api.put('/config/ui-sections', payload);
      const saved = normalizeSections(res.data?.data?.sections || payload.sections);
      setSections(saved);
      writeCache(cacheKey, { sections: saved, fetchedAt: new Date().toISOString() });
      return saved;
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setSaving(false);
    }
  }, [cacheKey]);

  useEffect(() => { load(); }, [load]);

  return {
    sections,
    loading,
    saving,
    error,
    reload: load,
    save
  };
}
