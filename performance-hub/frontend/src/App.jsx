import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Sidebar from './components/layout/Sidebar';
import Dashboard from './pages/Dashboard';
import Leads from './pages/Leads';
import Orders from './pages/Orders';
import Settings from './pages/Settings';
import ClientCampaigns from './pages/ClientCampaigns';
import SidialHistory from './pages/SidialHistory';

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen md:h-screen flex-col md:flex-row overflow-hidden bg-transparent">
        <Sidebar />
        <main className="flex-1 overflow-hidden flex flex-col">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/leads" element={<Leads />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/sidial-history" element={<SidialHistory />} />
            <Route path="/clients-campaigns" element={<ClientCampaigns />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
