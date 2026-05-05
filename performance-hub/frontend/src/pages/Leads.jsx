import { useState, useEffect } from 'react';
import TopBar from '../components/layout/TopBar';
import KpiCard from '../components/ui/KpiCard';
import DataLoadingState from '../components/ui/DataLoadingState';
import ErrorBanner from '../components/ui/ErrorBanner';
import { useSidialLeads } from '../hooks/useSidialLeads';
import { format, startOfMonth, endOfMonth } from 'date-fns';

function toDateTime(date, isEnd) {
  return format(date, 'yyyy-MM-dd') + (isEnd ? ' 23:59:59' : ' 00:00:00');
}

function getLeadPhone(lead) {
  const direct = lead.cellulare
    || lead.mobile
    || lead.phone
    || lead.telefono
    || lead.Phone
    || lead.telephone
    || lead.msisdn
    || lead.tel
    || lead.numero;
  if (direct) return String(direct);

  const entries = Object.entries(lead || {});
  const hit = entries.find(([k, v]) => {
    const key = String(k || '').toLowerCase();
    if (!v) return false;
    return (
      key.includes('cell')
      || key.includes('phone')
      || key.includes('tel')
      || key.includes('mobile')
      || key.includes('msisdn')
    );
  });

  return hit?.[1] ? String(hit[1]) : '—';
}

function getLeadDateTime(lead) {
  return String(
    lead.createdWhen
    || lead.createWhen
    || lead.created_at
    || lead.date
    || ''
  ).slice(0, 19) || '—';
}

function getLeadCampaignRaw(lead) {
  return lead.campaignDescription
    || lead.campaign_name
    || lead.campaignName
    || lead.campaign
    || lead.campagna
    || '—';
}

function getLeadListRaw(lead) {
  return lead.listDescription
    || lead.list_name
    || lead.listName
    || lead.list
    || lead.lista
    || '—';
}

function readRangeState(key, fallback) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (parsed?.from && parsed?.to) {
      return parsed;
    }
  } catch {}
  return fallback;
}

function writeRangeState(key, dateRange) {
  try {
    sessionStorage.setItem(key, JSON.stringify(dateRange));
  } catch {}
}

export default function Leads() {
  const today = new Date();
  const initialDateRange = {
    from: toDateTime(startOfMonth(today), false),
    to: toDateTime(endOfMonth(today), true)
  };
  const [dateRange, setDateRange] = useState(readRangeState('ph:leads:range:v2', initialDateRange));
  const [tab, setTab] = useState('all');

  const { leads: googleLeads, loading: lg, error: eg, refetch: rg } =
    useSidialLeads(dateRange.from, dateRange.to, 'google');
  const { leads: metaLeads, loading: lm, error: em, refetch: rm } =
    useSidialLeads(dateRange.from, dateRange.to, 'meta');

  const allLeads = [...googleLeads, ...metaLeads].sort(
    (a, b) => new Date(b.createdWhen || 0) - new Date(a.createdWhen || 0)
  );
  const displayed = tab === 'google' ? googleLeads : tab === 'meta' ? metaLeads : allLeads;

  const loading = lg || lm;
  const errors = [eg, em].filter(Boolean);

  const handleRefresh = () => {
    rg({ forceSync: true });
    rm({ forceSync: true });
  };

  useEffect(() => {
    writeRangeState('ph:leads:range:v2', dateRange);
  }, [dateRange]);

  const TABS = [
    { key: 'all', label: 'Tutti', count: allLeads.length },
    { key: 'google', label: 'Google', count: googleLeads.length },
    { key: 'meta', label: 'Meta', count: metaLeads.length }
  ];

  return (
    <div className="flex flex-col h-full">
      <TopBar title="Lead" onDateChange={setDateRange} onRefresh={handleRefresh} />
      <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-transparent">

        {errors.map((e, i) => <ErrorBanner key={i} message={e} onRetry={handleRefresh} />)}
        {loading && (
          <DataLoadingState
            title="Caricamento lead"
            messages={[
              'Recupero lead salvate...',
              'Allineo stato campagne/liste...',
              'Aggiorno tabella lead...'
            ]}
          />
        )}

        {!loading && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
              <KpiCard label="Lead Google" value={googleLeads.length} color="blue" />
              <KpiCard label="Lead Meta" value={metaLeads.length} color="red" />
            </div>

            <div className="flex gap-1 mb-4 bg-slate-900/80 border border-slate-800 p-1 rounded-lg w-fit">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`text-sm px-4 py-1.5 rounded-md transition-colors ${
                    tab === t.key
                      ? 'bg-slate-700 text-slate-100 font-medium shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {t.label} <span className="text-xs ml-1 text-slate-500">({t.count})</span>
                </button>
              ))}
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[1600px]">
                <thead className="bg-slate-900 border-b border-slate-700">
                  <tr>
                    {['ID', 'Data', 'Cellulare', 'Cliente', 'Campagna CRM', 'Campagna SIDIAL', 'Lista SIDIAL', 'Stato', 'Fonte'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs text-slate-400 font-medium uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayed.map((lead, i) => (
                    <tr key={lead.id || i} className="border-b border-slate-800 hover:bg-slate-800/60">
                      <td className="px-4 py-3 text-slate-300 font-mono text-xs">
                        {lead.id || '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-200 font-mono text-xs">
                        {getLeadDateTime(lead)}
                      </td>
                      <td className="px-4 py-3 text-slate-400 font-mono text-xs">
                        {getLeadPhone(lead)}
                      </td>
                      <td className="px-4 py-3 text-slate-200 text-xs">
                        {lead.clientId || lead.brand || '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-200 text-xs">
                        {lead.internalCampaignName || lead.crmCampaignName || '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-200 text-xs">
                        {getLeadCampaignRaw(lead)}
                      </td>
                      <td className="px-4 py-3 text-slate-200 text-xs">
                        {getLeadListRaw(lead)}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-300">{lead.status || lead.stato || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          lead.source === 'google'
                            ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        }`}>
                          {lead.source === 'google' ? 'Google' : 'Meta'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {displayed.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-slate-500 text-sm">
                        Nessuna lead trovata per il periodo selezionato
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              </div>
              <div className="px-4 py-2 border-t border-slate-800 text-xs text-slate-500">
                {displayed.length} risultati
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
