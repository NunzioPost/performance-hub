// Props: leads (number), orders (number)
// Costruito con div proporzionali, no recharts
export default function FunnelChart({ leads = 0, orders = 0 }) {
  const convRate = leads > 0 ? ((orders / leads) * 100).toFixed(1) : '0.0';
  const ordersPct = leads > 0 ? Math.round((orders / leads) * 100) : 0;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="flex justify-between text-xs text-slate-400 mb-1">
          <span>Lead totali</span>
          <span className="font-medium text-slate-100">{leads.toLocaleString('it-IT')}</span>
        </div>
        <div className="h-6 bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full bg-sky-500 rounded-full w-full" />
        </div>
      </div>
      <div>
        <div className="flex justify-between text-xs text-slate-400 mb-1">
          <span>Ordini</span>
          <span className="font-medium text-slate-100">{orders.toLocaleString('it-IT')}</span>
        </div>
        <div className="h-6 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
            style={{ width: `${Math.max(ordersPct, 2)}%` }}
          />
        </div>
      </div>
      <div className="text-center text-sm font-semibold text-slate-200 pt-1">
        Tasso conversione: {convRate}%
      </div>
    </div>
  );
}
