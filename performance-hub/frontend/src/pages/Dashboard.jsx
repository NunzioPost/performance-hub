import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import TopBar from '../components/layout/TopBar';
import KpiCard from '../components/ui/KpiCard';
import TrendLineChart from '../components/charts/TrendLineChart';
import SourceBarChart from '../components/charts/SourceBarChart';
import FunnelChart from '../components/charts/FunnelChart';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import ErrorBanner from '../components/ui/ErrorBanner';
import { useSidialLeads } from '../hooks/useSidialLeads';
import { useSidialOrders } from '../hooks/useSidialOrders';
import { useMetaInsights } from '../hooks/useMetaInsights';
import { useGoogleInsights } from '../hooks/useGoogleInsights';
import { useCampaignConfig } from '../hooks/useCampaignConfig';
import { format, startOfMonth, endOfMonth } from 'date-fns';

function toDateTime(date, isEnd) {
  return format(date, 'yyyy-MM-dd') + (isEnd ? ' 23:59:59' : ' 00:00:00');
}

function formatCurrency(value) {
  return '€ ' + value.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
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

function toClientId(value) {
  return String(value || '').toLowerCase().trim();
}

function toSource(value) {
  const source = String(value || '').toLowerCase().trim();
  if (source === 'google' || source === 'meta') return source;
  return 'other';
}

function safeRatio(numerator, denominator) {
  if (!denominator) return 0;
  return numerator / denominator;
}

function SourceSummaryCard({ source, spend, leads, cpl, checkedAt, connected = true }) {
  return (
    <div className="bg-slate-900 text-slate-100 border border-slate-800 rounded-xl p-4 shadow-sm relative overflow-hidden min-h-[170px] flex flex-col">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-wide">{source}</p>
          <p className="text-3xl font-semibold mt-1 tabular-nums whitespace-nowrap">{formatCurrency(spend)}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wide">Lead</p>
          <p className="text-xl font-semibold mt-1 tabular-nums">{leads.toLocaleString('it-IT')}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wide">CPL</p>
          <p className="text-xl font-semibold mt-1 tabular-nums whitespace-nowrap">{leads > 0 ? formatCurrency(cpl) : '—'}</p>
        </div>
      </div>
      <div className="mt-auto pt-3 flex items-center justify-between">
        <span className={`text-xs font-medium ${connected ? 'text-emerald-300' : 'text-red-300'}`}>
          {connected ? 'Connesso' : 'Non connesso'}
        </span>
        <span className="text-xs text-slate-400 text-right">
          Aggiornato alle {checkedAt ? format(checkedAt, 'HH:mm:ss') : '—'}
        </span>
      </div>
      <div className={`absolute left-0 right-0 bottom-0 h-1 ${connected ? 'bg-emerald-500' : 'bg-red-500'}`} />
    </div>
  );
}

function OrdersSummaryCard({ orders, checkedAt, connected = true }) {
  return (
    <div className="bg-slate-900 text-slate-100 border border-slate-800 rounded-xl p-4 shadow-sm relative overflow-hidden min-h-[170px] flex flex-col">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-wide">Ordini</p>
          <p className="text-3xl font-semibold mt-1 tabular-nums">{orders.toLocaleString('it-IT')}</p>
        </div>
      </div>
      <div className="flex-1" />
      <div className="mt-auto pt-3 flex items-center justify-between">
        <span className={`text-xs font-medium ${connected ? 'text-emerald-300' : 'text-red-300'}`}>
          {connected ? 'Sync ok' : 'Sync ko'}
        </span>
        <span className="text-xs text-slate-400 text-right">
          Aggiornato alle {checkedAt ? format(checkedAt, 'HH:mm:ss') : '—'}
        </span>
      </div>
      <div className={`absolute left-0 right-0 bottom-0 h-1 ${connected ? 'bg-emerald-500' : 'bg-red-500'}`} />
    </div>
  );
}

export default function Dashboard() {
  const today = new Date();
  const initialDateRange = {
    from: toDateTime(startOfMonth(today), false),
    to: toDateTime(endOfMonth(today), true)
  };
  const [dateRange, setDateRange] = useState(readRangeState('ph:dashboard:range:v2', initialDateRange));
  const [lastUpdated, setLastUpdated] = useState(null);
  const prevLoadingRef = useRef(false);
  const [expandedClients, setExpandedClients] = useState({});
  const [expandedCampaigns, setExpandedCampaigns] = useState({});

  const { config } = useCampaignConfig();

  const { leads: googleLeads, loading: l1, error: e1, refetch: r1 } =
    useSidialLeads(dateRange.from, dateRange.to, 'google');
  const { leads: metaLeads, loading: l2, error: e2, refetch: r2 } =
    useSidialLeads(dateRange.from, dateRange.to, 'meta');
  const { orders, loading: l3, error: e3, fetchedAt: ordersFetchedAt, refetch: r3 } =
    useSidialOrders(dateRange.from, dateRange.to);
  const { insights: metaInsights, loading: l4, error: e4, fetchedAt: metaFetchedAt, refetch: r4 } =
    useMetaInsights(dateRange.from, dateRange.to);
  const { insights: googleInsights, loading: l5, error: e5, fetchedAt: googleFetchedAt, refetch: r5 } =
    useGoogleInsights(dateRange.from, dateRange.to);

  const loading = l1 || l2 || l3 || l4 || l5;
  const errors = [e1, e2, e3, e4, e5].filter(Boolean);

  const refreshAppliedRange = useCallback(async () => {
    await Promise.allSettled([
      r1(),
      r2(),
      r3({ forceSync: true }),
      r4({ forceSync: true }),
      r5({ forceSync: true })
    ]);
  }, [r1, r2, r3, r4, r5]);

  const handleRefresh = useCallback(async () => {
    await refreshAppliedRange();
  }, [refreshAppliedRange]);

  useEffect(() => {
    if (prevLoadingRef.current && !loading) {
      setLastUpdated(new Date());
    }
    prevLoadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    const timer = setInterval(() => { refreshAppliedRange(); }, 15 * 60 * 1000);
    return () => clearInterval(timer);
  }, [refreshAppliedRange]);

  useEffect(() => {
    writeRangeState('ph:dashboard:range:v2', dateRange);
  }, [dateRange]);

  const totalLeads = googleLeads.length + metaLeads.length;
  const metaSpend = metaInsights?.spend || 0;
  const googleSpend = googleInsights?.spend || 0;
  const totalSpend = metaSpend + googleSpend;
  const avgCpl = totalLeads > 0 ? (totalSpend / totalLeads).toFixed(2) : '—';
  const totalOrders = orders.length;
  const convRate = totalLeads > 0 ? ((totalOrders / totalLeads) * 100).toFixed(1) : '0.0';
  const revenue = totalOrders * 50;
  const roas = totalSpend > 0 ? (revenue / totalSpend).toFixed(2) : '—';

  const googleCplValue = googleLeads.length > 0 ? (googleSpend / googleLeads.length) : 0;
  const metaCplValue = metaLeads.length > 0 ? (metaSpend / metaLeads.length) : 0;

  const { hierarchy } = useMemo(() => {
    const clientNameById = new Map(
      (Array.isArray(config?.clients) ? config.clients : [])
        .map((c) => [toClientId(c.id), c.name || c.id])
    );
    const campaignNameById = new Map(
      (Array.isArray(config?.campaigns) ? config.campaigns : [])
        .map((c) => [String(c.id || ''), c.name || c.id])
    );

    const ensureSource = (sourceMap, sourceKey) => {
      if (!sourceMap.has(sourceKey)) {
        sourceMap.set(sourceKey, { key: sourceKey, spend: 0, leads: 0, orders: 0 });
      }
      return sourceMap.get(sourceKey);
    };

    const ensureCampaign = (client, campaignId, fallbackName = '') => {
      const id = String(campaignId || '').trim();
      const key = id ? `id:${id}` : `name:${String(fallbackName || '').toLowerCase().trim() || 'non_attribuita'}`;
      if (!client.campaigns.has(key)) {
        client.campaigns.set(key, {
          key,
          id: id || null,
          name: campaignNameById.get(id) || fallbackName || 'Campagna non attribuita',
          spend: 0,
          leads: 0,
          orders: 0,
          sources: new Map()
        });
      }
      return client.campaigns.get(key);
    };

    const ensureClient = (map, clientId, fallbackName = '') => {
      const id = toClientId(clientId);
      if (!id) return null;
      if (!map.has(id)) {
        map.set(id, {
          id,
          name: clientNameById.get(id) || fallbackName || (id.charAt(0).toUpperCase() + id.slice(1)),
          spend: 0,
          leads: 0,
          orders: 0,
          campaigns: new Map(),
          sources: new Map()
        });
      }
      return map.get(id);
    };

    const clientsMap = new Map();
    (Array.isArray(config?.clients) ? config.clients : [])
      .filter((c) => c.active !== false)
      .forEach((c) => ensureClient(clientsMap, c.id, c.name));

    const allLeads = [...googleLeads, ...metaLeads];
    for (const lead of allLeads) {
      const client = ensureClient(clientsMap, lead.clientId || lead.brand);
      if (!client) continue;
      const source = toSource(lead.source);
      const campaign = ensureCampaign(
        client,
        lead.campaignId,
        lead.internalCampaignName || lead.crmCampaignName || lead.campaignName || ''
      );

      client.leads += 1;
      campaign.leads += 1;
      ensureSource(client.sources, source).leads += 1;
      ensureSource(campaign.sources, source).leads += 1;
    }

    const marketingRows = [
      ...(Array.isArray(googleInsights?.campaigns) ? googleInsights.campaigns.map((r) => ({ ...r, _source: 'google' })) : []),
      ...(Array.isArray(metaInsights?.campaigns) ? metaInsights.campaigns.map((r) => ({ ...r, _source: 'meta' })) : [])
    ];
    for (const row of marketingRows) {
      const client = ensureClient(clientsMap, row.clientId);
      if (!client) continue;
      const source = row._source;
      const campaign = ensureCampaign(
        client,
        row.crmCampaignId || row.campaignId,
        row.internalCampaignName || row.crmCampaignName || row.campaignName || ''
      );
      const spend = Number(row.spend || 0);

      client.spend += spend;
      campaign.spend += spend;
      ensureSource(client.sources, source).spend += spend;
      ensureSource(campaign.sources, source).spend += spend;
    }

    for (const order of orders) {
      const client = ensureClient(clientsMap, order.clientId || order.brand);
      if (!client) continue;
      const source = toSource(order.source);
      const campaign = ensureCampaign(
        client,
        order.campaignId,
        order.internalCampaignName || order.campaignName || ''
      );

      client.orders += 1;
      campaign.orders += 1;
      if (source !== 'other') {
        ensureSource(client.sources, source).orders += 1;
        ensureSource(campaign.sources, source).orders += 1;
      }
    }

    const toArrayWithKpis = (sourceMap) => {
      return Array.from(sourceMap.values())
        .filter((x) => (x.key === 'google' || x.key === 'meta') && (x.spend > 0 || x.leads > 0 || x.orders > 0))
        .map((x) => ({
          ...x,
          cpl: safeRatio(x.spend, x.leads),
          cpa: safeRatio(x.spend, x.orders)
        }))
        .sort((a, b) => b.spend - a.spend);
    };

    const hierarchyRows = Array.from(clientsMap.values())
      .map((client) => {
        const campaigns = Array.from(client.campaigns.values())
          .filter((c) => c.spend > 0 || c.leads > 0 || c.orders > 0)
          .map((c) => ({
            ...c,
            cpl: safeRatio(c.spend, c.leads),
            cpa: safeRatio(c.spend, c.orders),
            sources: toArrayWithKpis(c.sources)
          }))
          .sort((a, b) => b.spend - a.spend);

        return {
          ...client,
          cpl: safeRatio(client.spend, client.leads),
          cpa: safeRatio(client.spend, client.orders),
          campaigns,
          sources: toArrayWithKpis(client.sources)
        };
      })
      .sort((a, b) => b.spend - a.spend);

    return { hierarchy: hierarchyRows };
  }, [config, googleLeads, metaLeads, googleInsights, metaInsights, orders]);

  const tableRows = useMemo(() => {
    const rows = [];
    for (const client of hierarchy) {
      const clientOpen = !!expandedClients[client.id];
      rows.push({
        key: `client:${client.id}`,
        level: 'client',
        id: client.id,
        open: clientOpen,
        expandable: client.campaigns.length > 0,
        label: client.name,
        spend: client.spend,
        leads: client.leads,
        cpl: client.cpl,
        orders: client.orders,
        cpa: client.cpa,
        convRate: safeRatio(client.orders * 100, client.leads)
      });
      if (!clientOpen) continue;

      for (const campaign of client.campaigns) {
        const campaignOpen = !!expandedCampaigns[campaign.key];
        rows.push({
          key: `campaign:${campaign.key}`,
          level: 'campaign',
          id: campaign.key,
          open: campaignOpen,
          expandable: campaign.sources.length > 0,
          label: campaign.name,
          spend: campaign.spend,
          leads: campaign.leads,
          cpl: campaign.cpl,
          orders: campaign.orders,
          cpa: campaign.cpa,
          convRate: safeRatio(campaign.orders * 100, campaign.leads)
        });
        if (!campaignOpen) continue;
        for (const source of campaign.sources) {
          rows.push({
            key: `source:${campaign.key}:${source.key}`,
            level: 'source',
            id: `${campaign.key}:${source.key}`,
            label: source.key === 'google' ? 'Google' : 'Meta',
            spend: source.spend,
            leads: source.leads,
            cpl: source.cpl,
            orders: source.orders,
            cpa: source.cpa,
            convRate: safeRatio(source.orders * 100, source.leads)
          });
        }
      }
    }
    return rows;
  }, [hierarchy, expandedClients, expandedCampaigns]);

  function toggleClient(clientId) {
    setExpandedClients((prev) => ({ ...prev, [clientId]: !prev[clientId] }));
  }

  function toggleCampaign(campaignKey) {
    setExpandedCampaigns((prev) => ({ ...prev, [campaignKey]: !prev[campaignKey] }));
  }

  return (
    <div className="flex flex-col h-full">
      <TopBar title="Dashboard" onDateChange={setDateRange} onRefresh={handleRefresh} />
      <div className="flex-1 overflow-y-auto p-6 bg-transparent">

        {errors.length > 0 && (
          <div className="flex flex-col gap-2 mb-4">
            {errors.map((e, i) => <ErrorBanner key={i} message={e} onRetry={handleRefresh} />)}
          </div>
        )}

        {loading && <LoadingSpinner />}

        {!loading && (
          <>
            <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 mb-5">
              <SourceSummaryCard
                source="Meta"
                spend={metaSpend}
                leads={metaLeads.length}
                cpl={metaCplValue}
                checkedAt={metaFetchedAt || lastUpdated}
                connected={metaInsights !== null && !e4}
              />
              <SourceSummaryCard
                source="Google"
                spend={googleSpend}
                leads={googleLeads.length}
                cpl={googleCplValue}
                checkedAt={googleFetchedAt || lastUpdated}
                connected={googleInsights !== null && !e5}
              />
              <OrdersSummaryCard
                orders={totalOrders}
                checkedAt={ordersFetchedAt || lastUpdated}
                connected={!e3}
              />
              <SourceSummaryCard
                source="Totale"
                spend={totalSpend}
                leads={totalLeads}
                cpl={totalLeads > 0 ? totalSpend / totalLeads : 0}
                checkedAt={lastUpdated}
                connected={true}
              />
            </div>

            <div className="grid grid-cols-4 gap-3 mb-3">
              <KpiCard label="Lead Totali" value={totalLeads.toLocaleString('it-IT')} color="blue" />
              <KpiCard label="Spesa Totale" value={'€ ' + totalSpend.toLocaleString('it-IT', { minimumFractionDigits: 2 })} color="red" />
              <KpiCard label="CPL Medio" value={avgCpl !== '—' ? '€ ' + avgCpl : '—'} color="purple" />
              <KpiCard label="Ordini" value={totalOrders.toLocaleString('it-IT')} color="green" />
            </div>

            <div className="grid grid-cols-3 gap-3 mb-5">
              <KpiCard label="Tasso Conv." value={convRate + '%'} sub="lead → ordine" color="green" />
              <KpiCard label="Revenue Stim." value={'€ ' + revenue.toLocaleString('it-IT')} sub="€50/ordine placeholder" color="blue" />
              <KpiCard label="ROAS" value={roas} sub="revenue / spesa" color="purple" />
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 mb-4">
              <p className="text-sm font-medium text-slate-200 mb-3">Spaccato Clienti / Campagne / Fonti</p>
              {tableRows.length === 0 && (
                <p className="text-sm text-slate-400">Nessun dato attribuibile al momento.</p>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-sm border border-slate-800 rounded-lg overflow-hidden">
                  <thead className="bg-slate-900 border-b border-slate-700">
                    <tr>
                      {['Nome', 'Speso', 'Lead', 'CPL', 'Ordini', 'CPA', 'Conv %'].map((h) => (
                        <th key={h} className="px-3 py-2 text-left text-xs text-slate-400 uppercase tracking-wide font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((row) => (
                      <tr key={row.key} className="border-b border-slate-800 last:border-b-0">
                        <td className={`px-3 py-2 ${
                          row.level === 'client'
                            ? 'text-slate-100 font-semibold'
                            : row.level === 'campaign'
                              ? 'text-slate-200 pl-6'
                              : 'text-slate-300 pl-10'
                        }`}>
                          {row.level !== 'source' && row.expandable ? (
                            <button
                              type="button"
                              onClick={() => (row.level === 'client' ? toggleClient(row.id) : toggleCampaign(row.id))}
                              className="inline-flex items-center gap-1 hover:text-emerald-300 transition-colors"
                            >
                              {row.open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              {row.label}
                            </button>
                          ) : (
                            row.label
                          )}
                        </td>
                        <td className="px-3 py-2 text-slate-200">{formatCurrency(row.spend)}</td>
                        <td className="px-3 py-2 text-slate-200">{row.leads.toLocaleString('it-IT')}</td>
                        <td className="px-3 py-2 text-slate-200">{row.leads > 0 ? formatCurrency(row.cpl) : '—'}</td>
                        <td className="px-3 py-2 text-slate-100 font-medium">{row.orders.toLocaleString('it-IT')}</td>
                        <td className="px-3 py-2 text-slate-200">{row.orders > 0 ? formatCurrency(row.cpa) : '—'}</td>
                        <td className="px-3 py-2 text-slate-200">{row.leads > 0 ? formatPercent(row.convRate) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 mb-4">
              <p className="text-sm font-medium text-slate-200 mb-3">Trend lead giornalieri</p>
              <TrendLineChart
                googleData={googleInsights?.daily || []}
                metaData={metaInsights?.daily || []}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5">
                <p className="text-sm font-medium text-slate-200 mb-3">Spesa per fonte</p>
                <SourceBarChart metaSpend={metaSpend} googleSpend={googleSpend} />
              </div>
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5">
                <p className="text-sm font-medium text-slate-200 mb-3">Funnel lead → ordini</p>
                <FunnelChart leads={totalLeads} orders={totalOrders} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
