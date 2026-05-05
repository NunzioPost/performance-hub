// Props: label (string), value (string|number), sub (string),
// trend (number|null), color ("blue"|"red"|"green"|"purple")
export default function KpiCard({ label, value, sub, trend, color = 'blue' }) {
  const colorMap = {
    blue: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    red: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    green: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    purple: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
  };

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col gap-1 relative overflow-hidden">
      <span className="text-xs text-slate-400 uppercase tracking-wide font-medium">{label}</span>
      <span className="text-2xl font-semibold font-mono tracking-tight text-slate-100">{value}</span>
      <div className="flex items-center gap-2 mt-1">
        {sub && <span className="text-xs text-slate-500">{sub}</span>}
        {trend !== null && trend !== undefined && (
          <span className={`text-xs font-medium px-1.5 py-0.5 rounded border ${trend >= 0 ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-rose-500/15 text-rose-300 border-rose-500/30'}`}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
          </span>
        )}
      </div>
      <span className={`absolute inset-x-0 bottom-0 h-1 ${colorMap[color]?.split(' ')[0] || 'bg-slate-500/20'}`} />
    </div>
  );
}
