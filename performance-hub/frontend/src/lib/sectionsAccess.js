export const DEFAULT_UI_SECTIONS = [
  { key: 'dashboard', label: 'Dashboard', route: '/', userEnabled: true, adminEnabled: true, sortOrder: 10 },
  { key: 'leads', label: 'Lead', route: '/leads', userEnabled: true, adminEnabled: true, sortOrder: 20 },
  { key: 'orders', label: 'Ordini', route: '/orders', userEnabled: true, adminEnabled: true, sortOrder: 30 },
  { key: 'sidial_history', label: 'Storico SIDIAL', route: '/sidial-history', userEnabled: false, adminEnabled: true, sortOrder: 40 },
  { key: 'clients_campaigns', label: 'Clienti & Campagne', route: '/clients-campaigns', userEnabled: false, adminEnabled: true, sortOrder: 50 },
  { key: 'settings', label: 'Impostazioni', route: '/settings', userEnabled: false, adminEnabled: true, sortOrder: 60 }
];

const BY_KEY = new Map(DEFAULT_UI_SECTIONS.map((x) => [x.key, x]));

export function normalizeSections(input) {
  const arr = Array.isArray(input) ? input : [];
  const byKey = new Map();
  for (const fallback of DEFAULT_UI_SECTIONS) byKey.set(fallback.key, { ...fallback });

  for (const row of arr) {
    const key = String(row?.key || '').trim();
    if (!BY_KEY.has(key)) continue;
    const base = BY_KEY.get(key);
    byKey.set(key, {
      ...base,
      ...row,
      key,
      userEnabled: row?.userEnabled !== undefined ? !!row.userEnabled : base.userEnabled,
      adminEnabled: row?.adminEnabled !== undefined ? !!row.adminEnabled : base.adminEnabled
    });
  }

  const list = Array.from(byKey.values())
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
  return list;
}

export function canAccessSection(role, sections, key) {
  const normalizedRole = String(role || 'user').toLowerCase();
  const list = normalizeSections(sections);
  const row = list.find((x) => x.key === key);
  if (!row) return false;
  return normalizedRole === 'admin' ? !!row.adminEnabled : !!row.userEnabled;
}

export function firstAllowedRoute(role, sections) {
  const list = normalizeSections(sections);
  for (const row of list) {
    if (canAccessSection(role, list, row.key)) return row.route;
  }
  return '/';
}
