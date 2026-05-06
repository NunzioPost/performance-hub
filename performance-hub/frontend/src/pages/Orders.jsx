import { useState, useEffect } from 'react';
import TopBar from '../components/layout/TopBar';
import KpiCard from '../components/ui/KpiCard';
import DataLoadingState from '../components/ui/DataLoadingState';
import ErrorBanner from '../components/ui/ErrorBanner';
import { useSidialOrders } from '../hooks/useSidialOrders';
import api from '../lib/api';
import { format, startOfMonth, endOfMonth } from 'date-fns';

function toDateTime(date, isEnd) {
  return format(date, 'yyyy-MM-dd') + (isEnd ? ' 23:59:59' : ' 00:00:00');
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

export default function Orders() {
  const today = new Date();
  const initialDateRange = {
    from: toDateTime(startOfMonth(today), false),
    to: toDateTime(endOfMonth(today), true)
  };
  const [dateRange, setDateRange] = useState(readRangeState('ph:orders:range:v2', initialDateRange));
  const {
    orders, loading, error, refetch, lastSyncAt, syncStatus, syncMeta
  } = useSidialOrders(dateRange.from, dateRange.to, true);
  const [enriching, setEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState({ done: 0, total: 0 });

  const toEnrich = orders.filter((o) => !o.details_loaded || o.details_loaded !== 'yes');

  useEffect(() => {
    writeRangeState('ph:orders:range:v2', dateRange);
  }, [dateRange]);

  useEffect(() => {
    if (syncStatus !== 'syncing') return;
    const timer = setInterval(() => {
      refetch({ forceSync: false });
    }, 8000);
    return () => clearInterval(timer);
  }, [syncStatus, refetch]);

  function handleRefresh() {
    // Refresh manuale: forza sync live su SIDIAL anche su range storico.
    refetch({ forceSync: true });
  }

  async function handleEnrich() {
    if (toEnrich.length === 0) return;
    setEnriching(true);
    setEnrichProgress({ done: 0, total: toEnrich.length });
    try {
      const ids = toEnrich.map((o) => String(o.id)).filter(Boolean);
      const res = await api.post('/sidial/orders/enrich-batch', { orderIds: ids, concurrency: 4 }, { timeout: 180000 });
      setEnrichProgress({ done: Number(res.data?.done || ids.length), total: ids.length });
    } catch {}
    setEnriching(false);
    refetch({ forceSync: false });
  }

  return (
    <div className="flex flex-col h-full">
      <TopBar title="Ordini" onDateChange={setDateRange} onRefresh={handleRefresh} />
      <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-transparent">

        {error && <ErrorBanner message={error} onRetry={handleRefresh} />}
        {loading && (
          <DataLoadingState
            title="Caricamento ordini"
            messages={[
              'Leggo ordini gia salvati...',
              'Verifico dettagli disponibili...',
              'Aggiorno lo stato ordini...'
            ]}
          />
        )}

        {!loading && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
              <KpiCard label="Ordini Totali" value={orders.length} color="green" />
              <KpiCard label="Da arricchire" value={toEnrich.length} color="purple" />
            </div>

            <div className="mb-3 text-xs text-slate-400">
              Ultimo sync ordini: {lastSyncAt ? lastSyncAt.toLocaleString('it-IT') : '—'} {syncStatus ? `(${syncStatus})` : ''}
            </div>
            {syncStatus === 'syncing' && (
              <div className="mb-3 text-xs text-amber-300">
                Sync in corso
                {syncMeta?.chunksDone ? ` • chunk completati: ${syncMeta.chunksDone}` : ''}
                {syncMeta?.resumeFrom ? ` • ripartenza da: ${syncMeta.resumeFrom}` : ''}
              </div>
            )}

            <div className="flex justify-end mb-3">
              <button
                onClick={handleEnrich}
                disabled={enriching || toEnrich.length === 0}
                className="text-sm px-4 py-2 bg-emerald-600 text-slate-950 font-medium rounded-lg hover:bg-emerald-500 disabled:opacity-40 transition-colors"
              >
                {enriching
                  ? `Arricchimento... ${enrichProgress.done}/${enrichProgress.total}`
                  : `Arricchisci dettagli (${toEnrich.length})`}
              </button>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[1400px]">
                <thead className="bg-slate-900 border-b border-slate-700">
                  <tr>
                    {['ID', 'Data', 'Cliente', 'Campagna CRM', 'Fonte', 'Lista', 'Servizio', 'Stato', 'Dettagli'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs text-slate-400 font-medium uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order, i) => (
                    <tr key={order.id || i} className="border-b border-slate-800 hover:bg-slate-800/60">
                      <td className="px-4 py-3 font-mono text-xs text-slate-300">{order.id || '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-200">
                        {String(order.createdWhen || order.createWhen || order.date || '').slice(0, 19) || '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-200">{order.clientId || order.brand || '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-200">{order.internalCampaignName || order.campaignName || order.campaignDescription || '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-200">
                        {order.source
                          ? (String(order.source).toLowerCase() === 'google'
                              ? 'Google'
                              : String(order.source).toLowerCase() === 'meta'
                                ? 'Meta'
                                : order.source)
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-200">{order.listName || order.listDescription || order.list || '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-200">{order.service || order.services || order.serviceDescription || '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-300">{order.status || order.stato || order.statusLabel || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          order.details_loaded === 'yes'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        }`}>
                          {order.details_loaded === 'yes' ? 'Caricati' : 'Pending'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {orders.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-slate-500 text-sm">
                        Nessun ordine trovato per il periodo selezionato
                      </td>
                    </tr>
                  )}
                </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
