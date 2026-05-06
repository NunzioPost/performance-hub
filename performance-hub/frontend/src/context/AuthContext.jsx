import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api, { setApiAuthToken, setApiUnauthorizedHandler } from '../lib/api';
import {
  clearCacheScope,
  clearPerformanceHubCache,
  setCacheScope
} from '../lib/cacheScope';

const AUTH_STORAGE_KEY = 'ph:auth:v1';
const AuthContext = createContext(null);

function readStoredAuth() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.token || !parsed?.user?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredAuth(value) {
  try {
    if (!value) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      return;
    }
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(value));
  } catch {}
}

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(() => readStoredAuth());
  const [ready, setReady] = useState(false);

  const applyAuthState = useCallback((next) => {
    setAuth(next || null);
    writeStoredAuth(next || null);
    setApiAuthToken(next?.token || null);
    if (next?.user?.id) {
      setCacheScope(`user:${next.user.id}`);
    } else {
      clearCacheScope();
    }
  }, []);

  const logout = useCallback(async (silent = false) => {
    const currentToken = auth?.token;
    try {
      if (currentToken) {
        await api.post('/auth/logout', {}, { headers: { 'x-skip-auth-handler': '1' } });
      }
    } catch {}
    applyAuthState(null);
    clearPerformanceHubCache({ keepAuth: true });
    if (!silent) setReady(true);
  }, [auth?.token, applyAuthState]);

  const refreshMe = useCallback(async () => {
    if (!auth?.token) return null;
    const res = await api.get('/auth/me');
    const next = { ...auth, user: res.data?.user || auth.user };
    applyAuthState(next);
    return next;
  }, [auth, applyAuthState]);

  const login = useCallback(async ({ email, password }) => {
    const res = await api.post('/auth/login', { email, password });
    const next = {
      token: res.data?.token,
      expiresAt: res.data?.expiresAt || null,
      user: res.data?.user || null
    };
    applyAuthState(next);
    clearPerformanceHubCache({ keepAuth: true });
    return next;
  }, [applyAuthState]);

  useEffect(() => {
    const stored = readStoredAuth();
    if (!stored?.token) {
      setApiAuthToken(null);
      setReady(true);
      return;
    }

    setApiAuthToken(stored.token);
    applyAuthState(stored);
    refreshMe()
      .catch(() => logout(true))
      .finally(() => setReady(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setApiUnauthorizedHandler(() => {
      logout(true);
    });
    return () => setApiUnauthorizedHandler(null);
  }, [logout]);

  const value = useMemo(() => ({
    ready,
    user: auth?.user || null,
    token: auth?.token || null,
    isAuthenticated: !!auth?.token,
    isAdmin: String(auth?.user?.role || '') === 'admin',
    login,
    logout,
    refreshMe
  }), [ready, auth, login, logout, refreshMe]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve essere usato dentro AuthProvider');
  return ctx;
}
