import { dbEnabled, dbQuery } from '../lib/db.js';

const DEFAULT_SECTIONS = [
  { key: 'dashboard', label: 'Dashboard', route: '/', userEnabled: true, adminEnabled: true, sortOrder: 10 },
  { key: 'leads', label: 'Lead', route: '/leads', userEnabled: true, adminEnabled: true, sortOrder: 20 },
  { key: 'orders', label: 'Ordini', route: '/orders', userEnabled: true, adminEnabled: true, sortOrder: 30 },
  { key: 'sidial_history', label: 'Storico SIDIAL', route: '/sidial-history', userEnabled: false, adminEnabled: true, sortOrder: 40 },
  { key: 'clients_campaigns', label: 'Clienti & Campagne', route: '/clients-campaigns', userEnabled: false, adminEnabled: true, sortOrder: 50 },
  { key: 'settings', label: 'Impostazioni', route: '/settings', userEnabled: false, adminEnabled: true, sortOrder: 60 }
];

function toRowPayload(row) {
  return {
    key: row.section_key,
    label: row.label,
    route: row.route,
    userEnabled: row.user_enabled !== false,
    adminEnabled: row.admin_enabled !== false,
    sortOrder: Number(row.sort_order || 0)
  };
}

async function ensureDefaults() {
  for (const item of DEFAULT_SECTIONS) {
    await dbQuery(
      `insert into config_ui_sections (section_key, label, route, user_enabled, admin_enabled, sort_order, updated_at)
       values ($1, $2, $3, $4, $5, $6, now())
       on conflict (section_key) do update set
         label = excluded.label,
         route = excluded.route,
         sort_order = excluded.sort_order`,
      [item.key, item.label, item.route, item.userEnabled, item.adminEnabled, item.sortOrder]
    );
  }
}

export async function getUiSectionsConfig() {
  if (!dbEnabled()) return { sections: DEFAULT_SECTIONS };
  await ensureDefaults();
  const res = await dbQuery(
    `select section_key, label, route, user_enabled, admin_enabled, sort_order
       from config_ui_sections
      order by sort_order asc, section_key asc`
  );
  return { sections: (res.rows || []).map(toRowPayload) };
}

export async function saveUiSectionsConfig(input = {}) {
  if (!dbEnabled()) {
    throw Object.assign(new Error('CONFIG_STORAGE=db richiesto per salvare le sezioni'), { status: 503, code: 'CONFIG_DB_REQUIRED' });
  }

  const nextSections = Array.isArray(input.sections) ? input.sections : [];
  if (nextSections.length === 0) {
    throw Object.assign(new Error('sections deve essere un array non vuoto'), { status: 400, code: 'UI_SECTIONS_INVALID' });
  }

  const byKey = new Map(DEFAULT_SECTIONS.map((x) => [x.key, x]));
  for (const section of nextSections) {
    const key = String(section?.key || '').trim();
    if (!byKey.has(key)) continue;
    const base = byKey.get(key);
    const userEnabled = section.userEnabled !== undefined ? !!section.userEnabled : base.userEnabled;
    let adminEnabled = section.adminEnabled !== undefined ? !!section.adminEnabled : base.adminEnabled;

    // Evita lockout dell'admin dalla sezione impostazioni.
    if (key === 'settings') adminEnabled = true;

    await dbQuery(
      `insert into config_ui_sections (section_key, label, route, user_enabled, admin_enabled, sort_order, updated_at)
       values ($1, $2, $3, $4, $5, $6, now())
       on conflict (section_key) do update set
         user_enabled = excluded.user_enabled,
         admin_enabled = excluded.admin_enabled,
         updated_at = excluded.updated_at`,
      [base.key, base.label, base.route, userEnabled, adminEnabled, base.sortOrder]
    );
  }

  return getUiSectionsConfig();
}

export function getDefaultSections() {
  return DEFAULT_SECTIONS.map((x) => ({ ...x }));
}
