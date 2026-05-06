const AUTH_SCOPE_KEY = 'ph:auth:scope:v1';

function safeGet(storage, key) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(storage, key, value) {
  try {
    storage.setItem(key, value);
  } catch {}
}

function safeRemove(storage, key) {
  try {
    storage.removeItem(key);
  } catch {}
}

function cleanScope(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 'anonymous';
  return raw.replace(/[^a-z0-9:_-]/g, '_');
}

export function getCacheScope() {
  const local = safeGet(localStorage, AUTH_SCOPE_KEY);
  const session = safeGet(sessionStorage, AUTH_SCOPE_KEY);
  return cleanScope(local || session || 'anonymous');
}

export function setCacheScope(scope) {
  const next = cleanScope(scope);
  safeSet(localStorage, AUTH_SCOPE_KEY, next);
  safeSet(sessionStorage, AUTH_SCOPE_KEY, next);
}

export function clearCacheScope() {
  safeRemove(localStorage, AUTH_SCOPE_KEY);
  safeRemove(sessionStorage, AUTH_SCOPE_KEY);
}

export function scopedKey(baseKey) {
  return `ph:scope:${getCacheScope()}:${String(baseKey || '')}`;
}

export function clearPerformanceHubCache({ keepAuth = true } = {}) {
  const keep = new Set(keepAuth ? ['ph:auth:v1', AUTH_SCOPE_KEY] : []);
  const shouldDrop = (key) => String(key || '').startsWith('ph:');

  for (const storage of [localStorage, sessionStorage]) {
    try {
      const keys = [];
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (shouldDrop(key) && !keep.has(key)) keys.push(key);
      }
      keys.forEach((key) => storage.removeItem(key));
    } catch {}
  }
}
