import { useMemo, useState } from 'react';
import { useUiSectionsConfig } from '../../hooks/useUiSectionsConfig';
import { normalizeSections } from '../../lib/sectionsAccess';

function Toggle({ checked, onChange, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      className={`w-11 h-6 rounded-full relative transition-colors ${checked ? 'bg-emerald-500' : 'bg-slate-700'} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`}
      />
    </button>
  );
}

export default function SectionsAccessSection() {
  const { sections, loading, saving, error, save } = useUiSectionsConfig();
  const [draft, setDraft] = useState(null);
  const [status, setStatus] = useState(null);
  const items = useMemo(() => normalizeSections(draft || sections), [draft, sections]);

  function patchItem(key, field, value) {
    const next = items.map((x) => (x.key === key ? { ...x, [field]: value } : x));
    setDraft(next);
    setStatus(null);
  }

  async function handleSave() {
    setStatus({ ok: null, msg: 'Salvataggio in corso...' });
    try {
      const saved = await save(items);
      setDraft(saved);
      setStatus({ ok: true, msg: 'Sezioni aggiornate con successo.' });
    } catch (e) {
      setStatus({ ok: false, msg: e.message || 'Errore salvataggio sezioni' });
    }
  }

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 mb-4">
      <h2 className="text-base font-semibold text-slate-100 mb-2">Accesso Sezioni</h2>
      <p className="text-xs text-slate-400 mb-4">
        Gestisci quali sezioni sono visibili e accessibili per i ruoli <code className="bg-slate-900 border border-slate-700 px-1 rounded">user</code> e <code className="bg-slate-900 border border-slate-700 px-1 rounded">admin</code>.
      </p>

      {error && <div className="mb-3 text-xs text-red-300">{error}</div>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400">
              <th className="text-left py-2 pr-2">Sezione</th>
              <th className="text-left py-2 pr-2">Route</th>
              <th className="text-left py-2 pr-2">User</th>
              <th className="text-left py-2 pr-2">Admin</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.key} className="border-b border-slate-800/70">
                <td className="py-2 pr-2 text-slate-200">{item.label}</td>
                <td className="py-2 pr-2 text-slate-400 font-mono text-xs">{item.route}</td>
                <td className="py-2 pr-2">
                  <Toggle
                    checked={!!item.userEnabled}
                    onChange={() => patchItem(item.key, 'userEnabled', !item.userEnabled)}
                    disabled={loading || saving}
                  />
                </td>
                <td className="py-2 pr-2">
                  <Toggle
                    checked={!!item.adminEnabled}
                    onChange={() => patchItem(item.key, 'adminEnabled', !item.adminEnabled)}
                    disabled={loading || saving || item.key === 'settings'}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3 mt-4">
        <button
          type="button"
          onClick={handleSave}
          disabled={loading || saving}
          className="text-sm px-4 py-2 bg-emerald-600 text-slate-950 font-medium rounded-lg hover:bg-emerald-500 disabled:opacity-60"
        >
          {saving ? 'Salvataggio...' : 'Salva sezioni'}
        </button>
        {status && (
          <span className={`text-xs ${status.ok === true ? 'text-emerald-300' : status.ok === false ? 'text-red-300' : 'text-slate-400'}`}>
            {status.msg}
          </span>
        )}
      </div>
    </div>
  );
}
