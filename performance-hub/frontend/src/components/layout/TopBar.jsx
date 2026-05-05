import { RefreshCw } from 'lucide-react';
import DateRangePicker from '../ui/DateRangePicker';

// Props: title, onDateChange, onRefresh
export default function TopBar({ title, onDateChange, onRefresh }) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 px-4 md:px-6 py-4 border-b border-slate-800 bg-slate-950/60 backdrop-blur">
      <h1 className="text-base font-semibold text-slate-100 shrink-0">{title}</h1>
      <div className="w-full md:w-auto">
        <DateRangePicker onChange={onDateChange} />
      </div>
      <button
        onClick={onRefresh}
        className="self-start md:self-auto flex items-center gap-1.5 text-sm text-slate-300 hover:text-slate-100 border border-slate-700 rounded-lg px-3 py-1.5 hover:bg-slate-800 transition-colors"
      >
        <RefreshCw size={13} />
        Aggiorna
      </button>
    </div>
  );
}
