export default function ErrorBanner({ message, onRetry }) {
  return (
    <div className="bg-rose-900/30 border border-rose-700/50 rounded-lg p-4 flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-rose-200">Errore</p>
        <p className="text-sm text-rose-300 mt-0.5">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-sm text-rose-200 font-medium underline shrink-0"
        >
          Riprova
        </button>
      )}
    </div>
  );
}
