import { useEffect, useMemo, useState, useCallback } from 'react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import api from '../lib/api';
import TopBar from '../components/layout/TopBar';
import KpiCard from '../components/ui/KpiCard';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import ErrorBanner from '../components/ui/ErrorBanner';

function toDateTime(date, isEnd) {
  return format(date, 'yyyy-MM-dd') + (isEnd ? ' 23:59:59' : ' 00:00:00');
}

export default function SidialHistory() {
  const today = new Date();
  const initialDateRange = {
    from: toDateTime(startOfMonth(today), false),
    to: toDateTime(endOfMonth(today), true)
  };

  const [dateRange, setDateRange] = useState(initialDateRange);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [leads, setLeads] = useState([]);
  const [orders, setOrders] = useState([]);
  const [lastSyncLeads, setLastSyncLeads] = useState(null);
  const [lastSyncOrders, setLastSyncOrders] = useState(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [l, o] = await Promise.all([
        api.get('/sidial/history/leads', { params: { dateFrom: dateRange.from, dateTo: dateRange.to } }),
        api.get('/sidial/history/orders', { params: { dateFrom: dateRange.from, dateTo: dateRange.to } })
      ]);

      setLeads(l.data.data || []);
      setOrders(o.data.data || []);
      setLastSyncLeads(l.data.lastSyncAt ? new Date(l.data.lastSyncAt) : null);
      setLastSyncOrders(o.data.lastSyncAt ? new Date(o.data.lastSyncAt) : null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [dateRange.from, dateRange.to]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  function handleRefresh() {
    fetchHistory();
  }

  const bySource = useMemo(() => {
    const acc = { google: 0, meta: 0, other: 0 };
    for (const l of leads) {
      const s = String(l.source || '').toLowerCase();
      if (s === 'google') acc.google += 1;
      else if (s === 'meta') acc.meta += 1;
      else acc.other += 1;
    }
    return acc;
  }, [leads]);

  return (
    <div className="flex flex-col h-full">
      <TopBar title="Storico SIDIAL" onDateChange={setDateRange} onRefresh={handleRefresh} />
      <div className="flex-1 overflow-y-auto p-6 bg-transparent">
        {error && <ErrorBanner message={error} onRetry={handleRefresh} />}
        {loading && <LoadingSpinner />}

        {!loading && (
          <>
            <div className="grid grid-cols-4 gap-3 mb-4">
              <KpiCard label="Lead totali" value={leads.length} color="blue" />
              <KpiCard label="Lead Google" value={bySource.google} color="green" />
              <KpiCard label="Lead Meta" value={bySource.meta} color="red" />
              <KpiCard label="Ordini storici" value={orders.length} color="purple" />
            </div>

            <div className="mb-4 text-xs text-slate-400 flex gap-6">
              <span>Ultimo sync lead: {lastSyncLeads ? lastSyncLeads.toLocaleString('it-IT') : '—'}</span>
              <span>Ultimo sync ordini: {lastSyncOrders ? lastSyncOrders.toLocaleString('it-IT') : '—'}</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-800 text-sm text-slate-200 font-medium">Lead (storico DB)</div>
                <div className="max-h-[420px] overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-900 sticky top-0"><tr className="text-slate-400"><th className="px-3 py-2 text-left">Data</th><th className="px-3 py-2 text-left">Cliente</th><th className="px-3 py-2 text-left">Campagna</th><th className="px-3 py-2 text-left">Fonte</th></tr></thead>
                    <tbody>
                      {leads.map((l, i) => (
                        <tr key={l.id || i} className="border-t border-slate-800">
                          <td className="px-3 py-2 text-slate-300">{String(l.createdWhen || '').slice(0, 19) || '—'}</td>
                          <td className="px-3 py-2 text-slate-200">{l.clientId || l.brand || '—'}</td>
                          <td className="px-3 py-2 text-slate-200">{l.crmCampaignName || l.internalCampaignName || l.campaignName || '—'}</td>
                          <td className="px-3 py-2 text-slate-300">{l.source || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-800 text-sm text-slate-200 font-medium">Ordini (storico DB)</div>
                <div className="max-h-[420px] overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-900 sticky top-0"><tr className="text-slate-400"><th className="px-3 py-2 text-left">ID</th><th className="px-3 py-2 text-left">Data</th><th className="px-3 py-2 text-left">Cliente</th><th className="px-3 py-2 text-left">Campagna</th><th className="px-3 py-2 text-left">Fonte</th></tr></thead>
                    <tbody>
                      {orders.map((o, i) => (
                        <tr key={o.id || i} className="border-t border-slate-800">
                          <td className="px-3 py-2 text-slate-300 font-mono">{o.id || '—'}</td>
                          <td className="px-3 py-2 text-slate-300">{String(o.createdWhen || o.date || '').slice(0, 19) || '—'}</td>
                          <td className="px-3 py-2 text-slate-200">{o.clientId || o.brand || '—'}</td>
                          <td className="px-3 py-2 text-slate-200">{o.internalCampaignName || o.campaignName || '—'}</td>
                          <td className="px-3 py-2 text-slate-300">{o.source || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
