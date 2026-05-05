import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell
} from 'recharts';

// Props: metaSpend (number), googleSpend (number)
export default function SourceBarChart({ metaSpend = 0, googleSpend = 0 }) {
  const data = [
    { name: 'Meta', value: metaSpend, color: '#f97316' },
    { name: 'Google', value: googleSpend, color: '#2563eb' }
  ];

  if (metaSpend === 0 && googleSpend === 0) {
    return (
      <div className="h-40 flex items-center justify-center text-sm text-slate-500">
        Connetti le API per vedere la spesa
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#cbd5e1' }} />
        <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }}
               tickFormatter={(v) => '€' + v.toLocaleString('it-IT')} />
        <Tooltip
          contentStyle={{ background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0' }}
          formatter={(v) => ['€' + v.toLocaleString('it-IT', { minimumFractionDigits: 2 }), 'Spesa']}
        />
        <Bar dataKey="value" radius={[6, 6, 0, 0]}>
          {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
