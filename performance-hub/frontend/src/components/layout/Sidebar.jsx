import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Users, FileText, Settings, BriefcaseBusiness, Database, LogOut
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import api from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import mediacomLogo from '../../assets/mediacom-logo-verde.svg';

const NAV = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/leads', icon: Users, label: 'Lead' },
  { to: '/orders', icon: FileText, label: 'Ordini' },
  { to: '/sidial-history', icon: Database, label: 'Storico SIDIAL' },
  { to: '/clients-campaigns', icon: BriefcaseBusiness, label: 'Clienti & Campagne' },
  { to: '/settings', icon: Settings, label: 'Impostazioni' }
];

function StatusDot({ ok }) {
  return (
    <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-green-400' : 'bg-red-400'}`} />
  );
}

export default function Sidebar() {
  const { user, isAdmin, logout } = useAuth();
  const [apiStatus, setApiStatus] = useState({ sidial: false, meta: false, google: false });
  const failCountRef = useRef({ sidial: 0, meta: 0, google: 0 });
  const navItems = NAV.filter((item) => {
    if (!isAdmin && (item.to === '/settings' || item.to === '/clients-campaigns')) return false;
    return true;
  });

  useEffect(() => {
    let active = true;
    const markOk = (key) => {
      failCountRef.current[key] = 0;
      if (active) setApiStatus((s) => ({ ...s, [key]: true }));
    };
    const markFail = (key) => {
      failCountRef.current[key] = Number(failCountRef.current[key] || 0) + 1;
      // Evita falsi rossi per micro-timeout/transienti.
      if (failCountRef.current[key] >= 3 && active) {
        setApiStatus((s) => ({ ...s, [key]: false }));
      }
    };

    async function refreshStatus() {
      try {
        const sidial = await api.get('/sidial/token-status');
        if (sidial.data?.valid) markOk('sidial');
        else markFail('sidial');
      } catch {
        markFail('sidial');
      }

      try {
        const r = await api.get('/meta/token-status');
        if (r.data?.valid) markOk('meta');
        else markFail('meta');
      } catch {
        markFail('meta');
      }

      try {
        const r = await api.get('/google/token-status');
        if (r.data?.valid) markOk('google');
        else markFail('google');
      } catch {
        markFail('google');
      }
    }

    refreshStatus();
    const interval = setInterval(refreshStatus, 45000);
    window.addEventListener('focus', refreshStatus);

    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener('focus', refreshStatus);
    };
  }, []);

  return (
    <aside className="w-full md:w-56 md:min-h-screen bg-slate-950/80 backdrop-blur border-b md:border-b-0 md:border-r border-slate-800 flex flex-col px-3 py-3 md:py-5 shrink-0">
      <div className="px-3 mb-3 md:mb-6">
        <img
          src={mediacomLogo}
          alt="Mediacom"
          className="h-7 md:h-8 w-auto"
          loading="eager"
        />
      </div>

      <nav className="flex flex-row md:flex-col gap-1 flex-1 overflow-x-auto md:overflow-visible pb-1 md:pb-0">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-slate-800 text-slate-100 font-medium border border-slate-700'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900'
              }`
            }
          >
            <Icon size={15} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="hidden md:flex border-t border-slate-800 pt-4 px-3 flex-col gap-2">
        <div className="mb-3 pb-3 border-b border-slate-800">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Account</p>
          <p className="text-xs text-slate-300 mt-1">{user?.name || user?.email || 'Utente'}</p>
          <p className="text-[11px] text-slate-500">{String(user?.role || 'user').toUpperCase()}</p>
          <button
            type="button"
            onClick={() => logout()}
            className="mt-2 inline-flex items-center gap-1 text-xs text-slate-300 hover:text-slate-100"
          >
            <LogOut size={12} />
            Esci
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-1 uppercase tracking-wide">Stato API</p>
        {[
          ['Sidial', apiStatus.sidial],
          ['Meta Ads', apiStatus.meta],
          ['Google Ads', apiStatus.google]
        ].map(([name, ok]) => (
          <div key={name} className="flex items-center justify-between">
            <span className="text-xs text-slate-400">{name}</span>
            <StatusDot ok={ok} />
          </div>
        ))}
      </div>
    </aside>
  );
}
