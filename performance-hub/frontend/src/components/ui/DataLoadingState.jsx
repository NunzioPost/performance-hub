import { useEffect, useMemo, useState } from 'react';

const DEFAULT_MESSAGES = [
  'Allineo la cache locale...',
  'Controllo eventuali nuovi record...',
  'Aggiorno metriche e attribuzioni...',
  'Quasi pronto...'
];

export default function DataLoadingState({
  title = 'Sincronizzazione dati in corso',
  messages = DEFAULT_MESSAGES
}) {
  const steps = useMemo(() => (Array.isArray(messages) && messages.length > 0 ? messages : DEFAULT_MESSAGES), [messages]);
  const [progress, setProgress] = useState(12);
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const pTimer = setInterval(() => {
      setProgress((p) => {
        if (p >= 92) return p;
        const next = p + (p < 40 ? 7 : p < 70 ? 4 : 2);
        return Math.min(next, 92);
      });
    }, 320);

    const mTimer = setInterval(() => {
      setMessageIndex((i) => (i + 1) % steps.length);
    }, 1400);

    return () => {
      clearInterval(pTimer);
      clearInterval(mTimer);
    };
  }, [steps.length]);

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 md:p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-sm text-slate-100 font-medium">{title}</p>
        <span className="text-xs text-emerald-300 tabular-nums">{progress}%</span>
      </div>
      <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-emerald-500 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-xs text-slate-400 mt-3 min-h-[18px]">{steps[messageIndex]}</p>
    </div>
  );
}
