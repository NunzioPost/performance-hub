export default function LoadingSpinner({ size = 'md' }) {
  const s = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-10 h-10' : 'w-6 h-6';
  return (
    <div className="flex items-center justify-center p-8">
      <div className={`${s} border-2 border-slate-700 border-t-emerald-400 rounded-full animate-spin`} />
    </div>
  );
}
