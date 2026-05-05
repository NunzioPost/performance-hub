import { useCallback, useEffect, useState } from 'react';
import api from '../lib/api';

export function useCampaignConfig() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/config/campaigns');
      setConfig(res.data?.data || null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const save = useCallback(async (nextConfig) => {
    setSaving(true);
    setError(null);
    try {
      const res = await api.put('/config/campaigns', nextConfig);
      const saved = res.data?.data || null;
      setConfig(saved);
      return saved;
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setSaving(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { config, loading, saving, error, reload: load, save };
}
