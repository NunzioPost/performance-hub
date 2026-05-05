import axios from 'axios';

const envBase = String(import.meta.env.VITE_API_BASE_URL || '').trim();
const baseURL = envBase || '/api';

const api = axios.create({
  baseURL,
  timeout: 30000
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.code === 'ECONNABORTED' || String(err.message || '').toLowerCase().includes('timeout')) {
      throw new Error('Richiesta in timeout: il backend sta sincronizzando i dati. Riprova tra poco.');
    }
    const msg = err.response?.data?.message || err.message || 'Errore di rete';
    throw new Error(msg);
  }
);

export default api;
