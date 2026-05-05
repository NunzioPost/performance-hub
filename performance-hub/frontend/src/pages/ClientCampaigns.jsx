import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Save, RefreshCw } from 'lucide-react';
import { useCampaignConfig } from '../hooks/useCampaignConfig';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import ErrorBanner from '../components/ui/ErrorBanner';

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

function normalizeCampaign(c) {
  return {
    id: c.id || uid('campaign'),
    clientId: c.clientId || '',
    name: c.name || '',
    active: c.active !== false,
    allowInternalLeads: c.allowInternalLeads !== false,
    sidial: {
      leadMappings: Array.isArray(c?.sidial?.leadMappings) ? c.sidial.leadMappings : [],
      orderListMappings: Array.isArray(c?.sidial?.orderListMappings) ? c.sidial.orderListMappings : []
    },
    attribution: {
      googleRules: Array.isArray(c?.attribution?.googleRules) ? c.attribution.googleRules : [],
      metaRules: Array.isArray(c?.attribution?.metaRules) ? c.attribution.metaRules : []
    }
  };
}

function normalizeConfig(cfg) {
  return {
    version: Number(cfg?.version || 2),
    clients: Array.isArray(cfg?.clients) ? cfg.clients : [],
    campaigns: Array.isArray(cfg?.campaigns) ? cfg.campaigns.map(normalizeCampaign) : []
  };
}

function RowActions({ onDelete }) {
  return (
    <button onClick={onDelete} className="text-rose-300 hover:text-rose-200">
      <Trash2 size={14} />
    </button>
  );
}

export default function ClientCampaigns() {
  const { config, loading, saving, error, save, reload } = useCampaignConfig();
  const [draft, setDraft] = useState(null);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (!config) return;
    const normalized = normalizeConfig(config);
    setDraft(normalized);

    const firstClient = normalized.clients[0]?.id || '';
    setSelectedClientId(firstClient);
    const firstCampaign = normalized.campaigns.find((c) => c.clientId === firstClient)?.id || '';
    setSelectedCampaignId(firstCampaign);
  }, [config]);

  const selectedClient = useMemo(() => {
    if (!draft) return null;
    return draft.clients.find((c) => c.id === selectedClientId) || null;
  }, [draft, selectedClientId]);

  const clientCampaigns = useMemo(() => {
    if (!draft || !selectedClientId) return [];
    return draft.campaigns.filter((c) => c.clientId === selectedClientId);
  }, [draft, selectedClientId]);

  const selectedCampaign = useMemo(() => {
    return clientCampaigns.find((c) => c.id === selectedCampaignId) || null;
  }, [clientCampaigns, selectedCampaignId]);

  useEffect(() => {
    if (!selectedClientId || !draft) return;
    const exists = clientCampaigns.some((c) => c.id === selectedCampaignId);
    if (!exists) setSelectedCampaignId(clientCampaigns[0]?.id || '');
  }, [selectedClientId, selectedCampaignId, clientCampaigns, draft]);

  function updateClient(index, key, value) {
    setDraft((d) => {
      const next = structuredClone(d);
      next.clients[index][key] = value;
      return next;
    });
  }

  function addClient() {
    setDraft((d) => {
      const next = structuredClone(d);
      const id = uid('client');
      next.clients.push({ id, name: 'Nuovo Cliente', active: true });
      setSelectedClientId(id);
      setSelectedCampaignId('');
      return next;
    });
  }

  function removeClient(index) {
    setDraft((d) => {
      const next = structuredClone(d);
      const removedClientId = next.clients[index]?.id;
      next.clients.splice(index, 1);
      next.campaigns = next.campaigns.filter((c) => c.clientId !== removedClientId);

      const fallbackClient = next.clients[0]?.id || '';
      setSelectedClientId(fallbackClient);
      setSelectedCampaignId(next.campaigns.find((c) => c.clientId === fallbackClient)?.id || '');
      return next;
    });
  }

  function updateCampaignById(campaignId, mutator) {
    setDraft((d) => {
      const next = structuredClone(d);
      const idx = next.campaigns.findIndex((c) => c.id === campaignId);
      if (idx < 0) return d;
      mutator(next.campaigns[idx]);
      return next;
    });
  }

  function addCampaignForSelectedClient() {
    if (!selectedClientId) return;
    setDraft((d) => {
      const next = structuredClone(d);
      const id = uid('campaign');
      next.campaigns.push(normalizeCampaign({
        id,
        clientId: selectedClientId,
        name: 'Nuova Campagna CRM',
        active: true,
        allowInternalLeads: true
      }));
      setSelectedCampaignId(id);
      return next;
    });
  }

  function removeCampaign(campaignId) {
    setDraft((d) => {
      const next = structuredClone(d);
      next.campaigns = next.campaigns.filter((c) => c.id !== campaignId);
      const fallback = next.campaigns.find((c) => c.clientId === selectedClientId)?.id || '';
      setSelectedCampaignId(fallback);
      return next;
    });
  }

  function addLeadMapping() {
    if (!selectedCampaignId) return;
    updateCampaignById(selectedCampaignId, (c) => {
      c.sidial.leadMappings.push({
        id: uid('lead_map'),
        active: true,
        source: 'google',
        sidialCampaignId: '',
        sidialListId: '',
        listLabel: '',
        internalCampaignName: c.name
      });
    });
  }

  function addOrderMapping() {
    if (!selectedCampaignId) return;
    updateCampaignById(selectedCampaignId, (c) => {
      c.sidial.orderListMappings.push({
        id: uid('order_map'),
        active: true,
        source: 'google',
        sidialListName: '',
        internalCampaignName: c.name
      });
    });
  }

  function addRule(channel) {
    if (!selectedCampaignId) return;
    updateCampaignById(selectedCampaignId, (c) => {
      const key = channel === 'google' ? 'googleRules' : 'metaRules';
      c.attribution[key].push({
        id: uid(`${channel}_rule`),
        active: true,
        matchType: 'contains',
        matchValue: '',
        internalCampaignName: c.name
      });
    });
  }

  async function handleSave() {
    if (!draft) return;
    setStatus(null);

    const normalized = structuredClone(draft);
    normalized.clients = normalized.clients
      .map((c) => ({
        ...c,
        id: slugify(c.id || c.name),
        name: String(c.name || '').trim() || c.id
      }))
      .filter((c) => c.id);

    normalized.campaigns = normalized.campaigns
      .map((c) => ({
        ...c,
        id: slugify(c.id || c.name),
        clientId: slugify(c.clientId),
        name: String(c.name || '').trim() || c.id
      }))
      .filter((c) => c.id && c.clientId);

    if (normalized.clients.length === 0) {
      setStatus({ ok: false, msg: 'Serve almeno un cliente' });
      return;
    }

    try {
      await save(normalized);
      setStatus({ ok: true, msg: 'Configurazione salvata' });
      await reload();
    } catch {
      setStatus({ ok: false, msg: 'Errore salvataggio' });
    }
  }

  if (loading && !draft) return <LoadingSpinner />;

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/60 backdrop-blur">
        <h1 className="text-base font-semibold text-slate-100">Clienti e Campagne</h1>
        <p className="text-xs text-slate-400 mt-0.5">Clicca un cliente e gestisci le sue campagne, mapping SIDIAL e regole naming.</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 bg-transparent flex flex-col gap-4">
        {error && <ErrorBanner message={error} onRetry={reload} />}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={reload} className="text-xs px-3 py-1.5 border border-slate-700 text-slate-200 rounded-lg hover:bg-slate-800 flex items-center gap-1">
              <RefreshCw size={12} /> Ricarica
            </button>
            <button onClick={handleSave} disabled={saving} className="text-xs px-3 py-1.5 bg-emerald-600 text-slate-950 rounded-lg hover:bg-emerald-500 flex items-center gap-1">
              <Save size={12} /> {saving ? 'Salvataggio...' : 'Salva'}
            </button>
          </div>
          {status && <span className={`text-xs ${status.ok ? 'text-emerald-300' : 'text-rose-300'}`}>{status.msg}</span>}
        </div>

        <div className="grid grid-cols-[280px_1fr] gap-4">
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm text-slate-100 font-semibold">Clienti</h2>
              <button onClick={addClient} className="text-xs px-2 py-1 border border-slate-700 rounded text-slate-200 hover:bg-slate-800 flex items-center gap-1"><Plus size={12} /> Aggiungi</button>
            </div>

            <div className="flex flex-col gap-2">
              {(draft?.clients || []).map((client, idx) => (
                <div key={client.id || idx} className={`border rounded-lg p-2 ${selectedClientId === client.id ? 'border-emerald-500 bg-slate-800/60' : 'border-slate-800 bg-slate-950/40'}`}>
                  <button onClick={() => setSelectedClientId(client.id)} className="w-full text-left">
                    <div className="text-sm text-slate-100 font-medium">{client.name || client.id}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{client.id}</div>
                  </button>
                  <div className="mt-2 grid grid-cols-[1fr_auto] gap-2 items-center">
                    <label className="text-[11px] text-slate-400">Attivo</label>
                    <input type="checkbox" checked={client.active !== false} onChange={(e) => updateClient(idx, 'active', e.target.checked)} />
                  </div>
                  <div className="mt-2 flex justify-end"><RowActions onDelete={() => removeClient(idx)} /></div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            {selectedClient ? (
              <>
                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
                  <h2 className="text-sm text-slate-100 font-semibold mb-3">Impostazioni Cliente: {selectedClient.name}</h2>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-slate-400 mb-1">ID Cliente</label>
                      <input
                        value={selectedClient.id}
                        onChange={(e) => {
                          const newId = e.target.value;
                          setDraft((d) => {
                            const next = structuredClone(d);
                            const cidx = next.clients.findIndex((c) => c.id === selectedClient.id);
                            if (cidx >= 0) next.clients[cidx].id = newId;
                            next.campaigns = next.campaigns.map((c) => (c.clientId === selectedClient.id ? { ...c, clientId: newId } : c));
                            setSelectedClientId(newId);
                            return next;
                          });
                        }}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-200"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Nome Cliente</label>
                      <input
                        value={selectedClient.name}
                        onChange={(e) => {
                          const value = e.target.value;
                          setDraft((d) => {
                            const next = structuredClone(d);
                            const cidx = next.clients.findIndex((c) => c.id === selectedClient.id);
                            if (cidx >= 0) next.clients[cidx].name = value;
                            return next;
                          });
                        }}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-200"
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm text-slate-100 font-semibold">Campagne di {selectedClient.name}</h2>
                    <button onClick={addCampaignForSelectedClient} className="text-xs px-2 py-1 border border-slate-700 rounded text-slate-200 hover:bg-slate-800 flex items-center gap-1"><Plus size={12} /> Aggiungi campagna</button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead><tr className="text-slate-400"><th className="text-left py-1">ID</th><th className="text-left py-1">Nome</th><th className="text-left py-1">Attiva</th><th className="text-left py-1">Lead interne</th><th /></tr></thead>
                      <tbody>
                        {clientCampaigns.map((c) => (
                          <tr key={c.id} className={`border-t border-slate-800 ${selectedCampaignId === c.id ? 'bg-slate-800/40' : ''}`}>
                            <td className="py-1"><input value={c.id} onChange={(e) => updateCampaignById(c.id, (x) => { x.id = e.target.value; })} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-200" /></td>
                            <td className="py-1"><input value={c.name} onChange={(e) => updateCampaignById(c.id, (x) => { x.name = e.target.value; })} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-200" /></td>
                            <td className="py-1"><input type="checkbox" checked={c.active !== false} onChange={(e) => updateCampaignById(c.id, (x) => { x.active = e.target.checked; })} /></td>
                            <td className="py-1"><input type="checkbox" checked={c.allowInternalLeads !== false} onChange={(e) => updateCampaignById(c.id, (x) => { x.allowInternalLeads = e.target.checked; })} /></td>
                            <td className="py-1">
                              <div className="flex items-center justify-end gap-2">
                                <button onClick={() => setSelectedCampaignId(c.id)} className="text-emerald-300">Apri</button>
                                <RowActions onDelete={() => removeCampaign(c.id)} />
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {selectedCampaign && (
                  <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col gap-4">
                    <h2 className="text-sm text-slate-100 font-semibold">Dettaglio Campagna: {selectedCampaign.name}</h2>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs text-slate-300">Mapping Lead SIDIAL</p>
                        <button onClick={addLeadMapping} className="text-xs px-2 py-1 border border-slate-700 rounded text-slate-200 hover:bg-slate-800">Aggiungi</button>
                      </div>
                      <div className="grid grid-cols-7 gap-2 text-xs text-slate-400 mb-1"><span>ID</span><span>Source</span><span>Campaign</span><span>List</span><span>Label</span><span>Internal Name</span><span /></div>
                      {selectedCampaign.sidial.leadMappings.map((m, idx) => (
                        <div key={m.id || idx} className="grid grid-cols-7 gap-2 mb-1">
                          <input value={m.id || ''} onChange={(e) => updateCampaignById(selectedCampaign.id, (c) => { c.sidial.leadMappings[idx].id = e.target.value; })} className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200" />
                          <select value={m.source || 'google'} onChange={(e) => updateCampaignById(selectedCampaign.id, (c) => { c.sidial.leadMappings[idx].source = e.target.value; })} className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"><option value="google">google</option><option value="meta">meta</option></select>
                          <input value={m.sidialCampaignId || ''} onChange={(e) => updateCampaignById(selectedCampaign.id, (c) => { c.sidial.leadMappings[idx].sidialCampaignId = e.target.value; })} className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200" />
                          <input value={m.sidialListId || ''} onChange={(e) => updateCampaignById(selectedCampaign.id, (c) => { c.sidial.leadMappings[idx].sidialListId = e.target.value; })} className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200" />
                          <input value={m.listLabel || ''} onChange={(e) => updateCampaignById(selectedCampaign.id, (c) => { c.sidial.leadMappings[idx].listLabel = e.target.value; })} className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200" />
                          <input value={m.internalCampaignName || ''} onChange={(e) => updateCampaignById(selectedCampaign.id, (c) => { c.sidial.leadMappings[idx].internalCampaignName = e.target.value; })} className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200" />
                          <button onClick={() => updateCampaignById(selectedCampaign.id, (c) => { c.sidial.leadMappings.splice(idx, 1); })} className="text-rose-300 text-left">Rimuovi</button>
                        </div>
                      ))}
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs text-slate-300">Mapping Ordini SIDIAL (Lista)</p>
                        <button onClick={addOrderMapping} className="text-xs px-2 py-1 border border-slate-700 rounded text-slate-200 hover:bg-slate-800">Aggiungi</button>
                      </div>
                      <div className="grid grid-cols-5 gap-2 text-xs text-slate-400 mb-1"><span>ID</span><span>Source</span><span>Lista SIDIAL</span><span>Internal Name</span><span /></div>
                      {selectedCampaign.sidial.orderListMappings.map((m, idx) => (
                        <div key={m.id || idx} className="grid grid-cols-5 gap-2 mb-1">
                          <input value={m.id || ''} onChange={(e) => updateCampaignById(selectedCampaign.id, (c) => { c.sidial.orderListMappings[idx].id = e.target.value; })} className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200" />
                          <select value={m.source || 'google'} onChange={(e) => updateCampaignById(selectedCampaign.id, (c) => { c.sidial.orderListMappings[idx].source = e.target.value; })} className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"><option value="google">google</option><option value="meta">meta</option></select>
                          <input value={m.sidialListName || ''} onChange={(e) => updateCampaignById(selectedCampaign.id, (c) => { c.sidial.orderListMappings[idx].sidialListName = e.target.value; })} className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200" />
                          <input value={m.internalCampaignName || ''} onChange={(e) => updateCampaignById(selectedCampaign.id, (c) => { c.sidial.orderListMappings[idx].internalCampaignName = e.target.value; })} className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200" />
                          <button onClick={() => updateCampaignById(selectedCampaign.id, (c) => { c.sidial.orderListMappings.splice(idx, 1); })} className="text-rose-300 text-left">Rimuovi</button>
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      {['google', 'meta'].map((channel) => {
                        const key = channel === 'google' ? 'googleRules' : 'metaRules';
                        const rows = selectedCampaign.attribution[key];
                        return (
                          <div key={channel}>
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs text-slate-300">Regole {channel.toUpperCase()}</p>
                              <button onClick={() => addRule(channel)} className="text-xs px-2 py-1 border border-slate-700 rounded text-slate-200 hover:bg-slate-800">Aggiungi</button>
                            </div>
                            <div className="grid grid-cols-5 gap-2 text-xs text-slate-400 mb-1"><span>ID</span><span>Type</span><span>Match</span><span>Internal Name</span><span /></div>
                            {rows.map((r, idx) => (
                              <div key={r.id || idx} className="grid grid-cols-5 gap-2 mb-1">
                                <input value={r.id || ''} onChange={(e) => updateCampaignById(selectedCampaign.id, (c) => { c.attribution[key][idx].id = e.target.value; })} className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200" />
                                <select value={r.matchType || 'contains'} onChange={(e) => updateCampaignById(selectedCampaign.id, (c) => { c.attribution[key][idx].matchType = e.target.value; })} className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"><option value="contains">contains</option><option value="equals">equals</option><option value="regex">regex</option></select>
                                <input value={r.matchValue || ''} onChange={(e) => updateCampaignById(selectedCampaign.id, (c) => { c.attribution[key][idx].matchValue = e.target.value; })} className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200" />
                                <input value={r.internalCampaignName || ''} onChange={(e) => updateCampaignById(selectedCampaign.id, (c) => { c.attribution[key][idx].internalCampaignName = e.target.value; })} className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200" />
                                <button onClick={() => updateCampaignById(selectedCampaign.id, (c) => { c.attribution[key].splice(idx, 1); })} className="text-rose-300 text-left">Rimuovi</button>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 text-sm text-slate-400">
                Crea o seleziona un cliente per configurare campagne e mapping.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
