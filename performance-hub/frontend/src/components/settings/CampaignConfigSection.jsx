import { useEffect, useState } from 'react';
import { useCampaignConfig } from '../../hooks/useCampaignConfig';

export default function CampaignConfigSection() {
  const { config, loading, saving, error, reload, save } = useCampaignConfig();
  const [jsonText, setJsonText] = useState('');
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (config) setJsonText(JSON.stringify(config, null, 2));
  }, [config]);

  async function handleSaveConfig() {
    setStatus(null);
    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      setStatus({ ok: false, msg: 'JSON non valido' });
      return;
    }

    try {
      await save(parsed);
      setStatus({ ok: true, msg: 'Configurazione campagne salvata' });
    } catch {
      setStatus({ ok: false, msg: 'Errore salvataggio configurazione' });
    }
  }

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 mb-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-base font-semibold text-slate-100">Clienti e Campagne</h2>
        <button
          onClick={reload}
          disabled={loading}
          className="text-xs px-3 py-1.5 border border-slate-700 text-slate-200 rounded-lg hover:bg-slate-800 disabled:opacity-50"
        >
          Ricarica
        </button>
      </div>

      <p className="text-xs text-slate-400 mb-3">
        Qui configuri clienti, mapping SIDIAL e regole di attribuzione Meta/Google. Puoi aggiungere nuovi clienti e nuove campagne senza deploy.
      </p>

      {error && <p className="text-xs text-rose-300 mb-3">{error}</p>}

      <textarea
        value={jsonText}
        onChange={(e) => setJsonText(e.target.value)}
        className="w-full min-h-[360px] text-xs font-mono border border-slate-700 rounded-lg p-3 bg-slate-950 text-slate-200 focus:outline-none focus:border-emerald-500"
      />

      <div className="flex items-center gap-3 mt-3">
        <button
          onClick={handleSaveConfig}
          disabled={saving || loading}
          className="text-sm px-4 py-2 bg-emerald-600 text-slate-950 font-medium rounded-lg hover:bg-emerald-500 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Salvataggio...' : 'Salva configurazione'}
        </button>
        {status && (
          <span className={`text-xs ${status.ok ? 'text-emerald-300' : 'text-rose-300'}`}>
            {status.msg}
          </span>
        )}
      </div>
    </div>
  );
}
