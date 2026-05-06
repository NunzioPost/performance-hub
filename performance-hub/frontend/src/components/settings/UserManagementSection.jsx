import { useEffect, useState } from 'react';
import api from '../../lib/api';

function RoleBadge({ role }) {
  const isAdmin = String(role || '') === 'admin';
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${isAdmin ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300' : 'bg-slate-800 border-slate-700 text-slate-300'}`}>
      {isAdmin ? 'Admin' : 'User'}
    </span>
  );
}

export default function UserManagementSection() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'user' });

  async function loadUsers() {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/auth/users');
      setUsers(res.data?.data || []);
    } catch (err) {
      setError(err.message || 'Errore caricamento utenti');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadUsers(); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/auth/users', form);
      setForm({ name: '', email: '', password: '', role: 'user' });
      await loadUsers();
    } catch (err) {
      setError(err.message || 'Errore creazione utente');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(user) {
    try {
      await api.patch(`/auth/users/${user.id}`, { active: !user.active });
      await loadUsers();
    } catch (err) {
      setError(err.message || 'Errore aggiornamento utente');
    }
  }

  async function toggleRole(user) {
    try {
      const role = String(user.role || '') === 'admin' ? 'user' : 'admin';
      await api.patch(`/auth/users/${user.id}`, { role });
      await loadUsers();
    } catch (err) {
      setError(err.message || 'Errore aggiornamento ruolo');
    }
  }

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 mb-4">
      <h2 className="text-base font-semibold text-slate-100 mb-4">Utenze</h2>

      {error && <div className="mb-3 p-3 rounded-lg border border-red-500/40 bg-red-500/10 text-red-300 text-sm">{error}</div>}

      <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-4">
        <input
          value={form.name}
          onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))}
          placeholder="Nome"
          className="text-sm border border-slate-700 rounded-lg px-3 py-2 bg-slate-950 text-slate-200"
          required
        />
        <input
          type="email"
          value={form.email}
          onChange={(e) => setForm((v) => ({ ...v, email: e.target.value }))}
          placeholder="Email"
          className="text-sm border border-slate-700 rounded-lg px-3 py-2 bg-slate-950 text-slate-200"
          required
        />
        <input
          type="password"
          value={form.password}
          onChange={(e) => setForm((v) => ({ ...v, password: e.target.value }))}
          placeholder="Password (min 8)"
          className="text-sm border border-slate-700 rounded-lg px-3 py-2 bg-slate-950 text-slate-200"
          required
          minLength={8}
        />
        <div className="flex gap-2">
          <select
            value={form.role}
            onChange={(e) => setForm((v) => ({ ...v, role: e.target.value }))}
            className="flex-1 text-sm border border-slate-700 rounded-lg px-3 py-2 bg-slate-950 text-slate-200"
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
          <button
            type="submit"
            disabled={saving}
            className="text-sm px-4 py-2 rounded-lg bg-emerald-600 text-slate-950 font-medium hover:bg-emerald-500 disabled:opacity-60"
          >
            {saving ? 'Salvo...' : 'Crea'}
          </button>
        </div>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-400 border-b border-slate-800">
              <th className="text-left py-2 pr-2">Nome</th>
              <th className="text-left py-2 pr-2">Email</th>
              <th className="text-left py-2 pr-2">Ruolo</th>
              <th className="text-left py-2 pr-2">Stato</th>
              <th className="text-left py-2 pr-2">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {!loading && users.map((u) => (
              <tr key={u.id} className="border-b border-slate-800/70">
                <td className="py-2 pr-2 text-slate-200">{u.name}</td>
                <td className="py-2 pr-2 text-slate-300">{u.email}</td>
                <td className="py-2 pr-2"><RoleBadge role={u.role} /></td>
                <td className="py-2 pr-2 text-slate-300">{u.active ? 'Attivo' : 'Disattivo'}</td>
                <td className="py-2 pr-2">
                  <div className="flex gap-2">
                    <button type="button" onClick={() => toggleRole(u)} className="text-xs text-sky-300 hover:text-sky-200">
                      Cambia ruolo
                    </button>
                    <button type="button" onClick={() => toggleActive(u)} className="text-xs text-amber-300 hover:text-amber-200">
                      {u.active ? 'Disattiva' : 'Attiva'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {loading && (
              <tr>
                <td colSpan={5} className="py-4 text-slate-400">Caricamento utenti...</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
