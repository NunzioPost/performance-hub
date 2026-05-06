import { useState } from 'react';
import api from '../lib/api';
import CampaignConfigSection from '../components/settings/CampaignConfigSection';
import UserManagementSection from '../components/settings/UserManagementSection';
import SectionsAccessSection from '../components/settings/SectionsAccessSection';
import { scopedKey } from '../lib/cacheScope';
import { useAuth } from '../context/AuthContext';

function Section({ title, fields, storageKey }) {
  const scopedStorageKey = scopedKey(storageKey);
  const saved = JSON.parse(localStorage.getItem(scopedStorageKey) || '{}');
  const [values, setValues] = useState(saved);
  const [status, setStatus] = useState(null);

  function handleSave() {
    localStorage.setItem(scopedStorageKey, JSON.stringify(values));
    setStatus({ ok: true, msg: 'Salvato. Ricorda di aggiornare il file .env del backend con questi valori.' });
  }

  async function handleTest() {
    setStatus({ ok: null, msg: 'Test in corso...' });
    try {
      await api.get('/health');
      setStatus({ ok: true, msg: 'Backend raggiungibile.' });
    } catch {
      setStatus({ ok: false, msg: 'Backend non raggiungibile.' });
    }
  }

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 mb-4">
      <h2 className="text-base font-semibold text-slate-100 mb-4">{title}</h2>
      <div className="flex flex-col gap-3">
        {fields.map((f) => (
          <div key={f.key} className="flex flex-col gap-1">
            <label className="text-xs text-slate-400 font-medium">{f.label}</label>
            <input
              type={f.secret ? 'password' : 'text'}
              value={values[f.key] || ''}
              readOnly={f.readonly}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              placeholder={f.placeholder || ''}
              className="text-sm border border-slate-700 rounded-lg px-3 py-2 font-mono bg-slate-950 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 mt-4">
        <button
          onClick={handleSave}
          className="text-sm px-4 py-2 bg-emerald-600 text-slate-950 font-medium rounded-lg hover:bg-emerald-500 transition-colors"
        >
          Salva riferimento
        </button>
        <button
          onClick={handleTest}
          className="text-sm px-4 py-2 border border-slate-700 text-slate-200 rounded-lg hover:bg-slate-800 transition-colors"
        >
          Testa connessione
        </button>
        {status && (
          <span className={`text-xs ${status.ok === true ? 'text-emerald-300' : status.ok === false ? 'text-rose-300' : 'text-slate-400'}`}>
            {status.msg}
          </span>
        )}
      </div>
    </div>
  );
}

export default function Settings() {
  const { isAdmin } = useAuth();

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/60 backdrop-blur">
        <h1 className="text-base font-semibold text-slate-100">Impostazioni</h1>
        <p className="text-xs text-slate-400 mt-0.5">
          I token reali vanno nel file <code className="bg-slate-900 border border-slate-700 px-1 rounded">.env</code> del backend.
        </p>
      </div>
      <div className="flex-1 overflow-y-auto p-6 bg-transparent">
        {isAdmin && <SectionsAccessSection />}
        {isAdmin && <UserManagementSection />}
        <CampaignConfigSection />

        <Section title="Sidial" storageKey="cfg_sidial" fields={[
          { key: 'baseUrl', label: 'Base URL', readonly: true, placeholder: 'https://mediacom.sidial.cloud/api.php' },
          { key: 'apiToken', label: 'API Token', secret: true, placeholder: 'Il tuo token Sidial' }
        ]} />
        <Section title="Meta Ads" storageKey="cfg_meta" fields={[
          { key: 'appId', label: 'App ID', placeholder: 'es. 123456789012345' },
          { key: 'appSecret', label: 'App Secret', secret: true },
          { key: 'accessToken', label: 'Access Token', secret: true, placeholder: 'EAAxxxxx...' },
          { key: 'accountId', label: 'Ad Account ID', placeholder: 'act_123456789' }
        ]} />
        <Section title="Google Ads" storageKey="cfg_google" fields={[
          { key: 'clientId', label: 'Client ID', placeholder: 'xxxxx.apps.googleusercontent.com' },
          { key: 'clientSecret', label: 'Client Secret', secret: true },
          { key: 'refreshToken', label: 'Refresh Token', secret: true },
          { key: 'developerToken', label: 'Developer Token', secret: true },
          { key: 'customerId', label: 'Customer ID', placeholder: 'es. 1234567890 (senza trattini)' }
        ]} />
      </div>
    </div>
  );
}
