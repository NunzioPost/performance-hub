import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';

// Props: googleData e metaData sono array di { date, leads, spend }
export default function TrendLineChart({ googleData = [], metaData = [] }) {
  // Merge per data: unifica i due array sullo stesso asse X
  const allDates = [...new Set([
    ...googleData.map((d) => d.date),
    ...metaData.map((d) => d.date)
  ])].sort();

  if (allDates.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-sm text-slate-500">
        Connetti le API per vedere i trend giornalieri
      </div>
    );
  }

  const merged = allDates.map((date) => {
    const g = googleData.find((d) => d.date === date);
    const m = metaData.find((d) => d.date === date);
    return {
      date,
      Google: g?.leads || 0,
      Meta: m?.leads || 0
    };
  });

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={merged} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          tickFormatter={(d) => {
            try { return format(parseISO(d), 'dd/MM', { locale: it }); }
            catch { return d; }
          }}
        />
        <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
        <Tooltip
          contentStyle={{ background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0' }}
          formatter={(value, name) => [value + ' lead', name]}
          labelFormatter={(d) => {
            try { return format(parseISO(d), 'dd MMMM yyyy', { locale: it }); }
            catch { return d; }
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: '#cbd5e1' }} />
        <Line type="monotone" dataKey="Google" stroke="#2563eb" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="Meta" stroke="#f97316" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
