import axios from 'axios';

const envBase = String(import.meta.env.VITE_API_BASE_URL || '').trim();
const baseURL = envBase || '/api';
let authToken = null;
let unauthorizedHandler = null;

const api = axios.create({
  baseURL,
  timeout: 60000
});

export function setApiAuthToken(token) {
  authToken = token ? String(token) : null;
}

export function setApiUnauthorizedHandler(handler) {
  unauthorizedHandler = typeof handler === 'function' ? handler : null;
}

api.interceptors.request.use((config) => {
  if (authToken) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${authToken}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const skipAuthHandler = String(err.config?.headers?.['x-skip-auth-handler'] || '') === '1';
    const isLoginCall = String(err.config?.url || '').includes('/auth/login');
    if (err.response?.status === 401 && unauthorizedHandler && !skipAuthHandler && !isLoginCall) {
      unauthorizedHandler(err);
    }
    if (err.code === 'ECONNABORTED' || String(err.message || '').toLowerCase().includes('timeout')) {
      throw new Error('Richiesta in timeout: il backend sta sincronizzando i dati. Riprova tra poco.');
    }
    const msg = err.response?.data?.message || err.message || 'Errore di rete';
    throw new Error(msg);
  }
);

export default api;
