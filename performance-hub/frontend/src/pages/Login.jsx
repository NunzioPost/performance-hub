import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login({ email, password });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || 'Login fallito');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 relative overflow-hidden flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.18),transparent_40%),radial-gradient(circle_at_80%_0%,rgba(59,130,246,0.18),transparent_35%)]" />

      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-2xl p-6 md:p-7 shadow-xl"
      >
        <div className="mb-6">
          <p className="text-slate-400 text-xs uppercase tracking-wide">Performance Hub</p>
          <h1 className="text-slate-100 text-2xl font-semibold mt-1">Accesso piattaforma</h1>
          <p className="text-slate-400 text-sm mt-1">Inserisci le tue credenziali per continuare.</p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-emerald-500"
              placeholder="admin@performance-hub.local"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-emerald-500"
              placeholder="••••••••"
            />
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-lg border border-red-500/40 bg-red-500/10 text-red-300 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-5 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500 text-slate-950 text-sm font-semibold hover:bg-emerald-400 disabled:opacity-60"
        >
          <LogIn size={16} />
          {loading ? 'Accesso in corso...' : 'Accedi'}
        </button>

        <p className="text-xs text-slate-500 mt-4">
          Primo accesso: usa l’admin bootstrap configurato nel backend.
        </p>
      </form>
    </div>
  );
}
