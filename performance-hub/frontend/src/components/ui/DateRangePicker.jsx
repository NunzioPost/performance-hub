import { useState } from 'react';
import { format, startOfMonth, endOfMonth, subMonths, subDays } from 'date-fns';

function toDateTime(date, isEnd = false) {
  return format(date, 'yyyy-MM-dd') + (isEnd ? ' 23:59:59' : ' 00:00:00');
}

const PRESETS = [
  { label: 'Oggi', key: 'today' },
  { label: 'Mese corrente', key: 'current_month' },
  { label: 'Mese scorso', key: 'last_month' },
  { label: 'Ultimi 30 gg', key: 'last_30' },
  { label: 'Ultimi 7 gg', key: 'last_7' }
];

export default function DateRangePicker({ onChange }) {
  const today = new Date();
  const initialFrom = startOfMonth(today);
  const initialTo = endOfMonth(today);

  const [active, setActive] = useState('current_month');
  const [customFrom, setCustomFrom] = useState(format(initialFrom, 'yyyy-MM-dd'));
  const [customTo, setCustomTo] = useState(format(initialTo, 'yyyy-MM-dd'));
  const [customError, setCustomError] = useState('');

  function emitRange(from, to) {
    onChange({ from: toDateTime(from, false), to: toDateTime(to, true) });
  }

  function applyPreset(key) {
    setActive(key);
    setCustomError('');
    let from;
    let to;
    if (key === 'today') {
      from = today; to = today;
    } else if (key === 'current_month') {
      from = startOfMonth(today); to = endOfMonth(today);
    } else if (key === 'last_month') {
      const prev = subMonths(today, 1);
      from = startOfMonth(prev); to = endOfMonth(prev);
    } else if (key === 'last_30') {
      from = subDays(today, 29); to = today;
    } else if (key === 'last_7') {
      from = subDays(today, 6); to = today;
    }
    setCustomFrom(format(from, 'yyyy-MM-dd'));
    setCustomTo(format(to, 'yyyy-MM-dd'));
    emitRange(from, to);
  }

  function applyCustomRange() {
    if (!customFrom || !customTo) return;
    const from = new Date(customFrom + 'T00:00:00');
    const to = new Date(customTo + 'T00:00:00');

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      setCustomError('Date non valide');
      return;
    }
    if (from > to) {
      setCustomError('La data iniziale deve essere precedente alla finale');
      return;
    }

    setActive('custom');
    setCustomError('');
    emitRange(from, to);
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 flex-wrap">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => applyPreset(p.key)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              active === p.key
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-500'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="date"
          value={customFrom}
          onChange={(e) => { setCustomFrom(e.target.value); setActive('custom'); }}
          className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-900 text-slate-200"
        />
        <span className="text-xs text-slate-400">a</span>
        <input
          type="date"
          value={customTo}
          onChange={(e) => { setCustomTo(e.target.value); setActive('custom'); }}
          className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-900 text-slate-200"
        />
        <button
          onClick={applyCustomRange}
          className="text-xs px-3 py-1.5 rounded-lg border border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700"
        >
          Applica
        </button>
      </div>
      {customError && <p className="text-xs text-red-400">{customError}</p>}
    </div>
  );
}
