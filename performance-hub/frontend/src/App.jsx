import { BrowserRouter, Navigate, Outlet, Routes, Route } from 'react-router-dom';
import Sidebar from './components/layout/Sidebar';
import Dashboard from './pages/Dashboard';
import Leads from './pages/Leads';
import Orders from './pages/Orders';
import Settings from './pages/Settings';
import ClientCampaigns from './pages/ClientCampaigns';
import SidialHistory from './pages/SidialHistory';
import Login from './pages/Login';
import { useAuth } from './context/AuthContext';
import { useUiSectionsConfig } from './hooks/useUiSectionsConfig';
import { canAccessSection, firstAllowedRoute } from './lib/sectionsAccess';

function ProtectedLayout() {
  return (
    <div className="flex min-h-screen md:h-screen flex-col md:flex-row overflow-hidden bg-transparent">
      <Sidebar />
      <main className="flex-1 overflow-hidden flex flex-col">
        <Outlet />
      </main>
    </div>
  );
}

function AuthGate({ adminOnly = false }) {
  const { ready, isAuthenticated, isAdmin } = useAuth();

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-300">
        Caricamento sessione...
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />;
  return <Outlet />;
}

function SectionGate({ sectionKey }) {
  const { user } = useAuth();
  const { sections, loading } = useUiSectionsConfig();
  const role = String(user?.role || 'user').toLowerCase();
  const allowed = canAccessSection(role, sections, sectionKey);
  const fallbackRoute = firstAllowedRoute(role, sections);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-300">
        Caricamento sezioni...
      </div>
    );
  }
  if (!allowed) return <Navigate to={fallbackRoute} replace />;
  return <Outlet />;
}

function PublicOnlyGate() {
  const { ready, isAuthenticated } = useAuth();
  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-300">
        Caricamento sessione...
      </div>
    );
  }
  if (isAuthenticated) return <Navigate to="/" replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<PublicOnlyGate />}>
          <Route path="/login" element={<Login />} />
        </Route>

        <Route element={<AuthGate />}>
          <Route element={<ProtectedLayout />}>
            <Route element={<SectionGate sectionKey="dashboard" />}>
              <Route path="/" element={<Dashboard />} />
            </Route>
            <Route element={<SectionGate sectionKey="leads" />}>
              <Route path="/leads" element={<Leads />} />
            </Route>
            <Route element={<SectionGate sectionKey="orders" />}>
              <Route path="/orders" element={<Orders />} />
            </Route>
            <Route element={<SectionGate sectionKey="sidial_history" />}>
              <Route path="/sidial-history" element={<SidialHistory />} />
            </Route>
            <Route element={<SectionGate sectionKey="clients_campaigns" />}>
              <Route path="/clients-campaigns" element={<ClientCampaigns />} />
            </Route>
            <Route element={<SectionGate sectionKey="settings" />}>
              <Route path="/settings" element={<Settings />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
