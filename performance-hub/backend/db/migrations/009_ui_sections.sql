create table if not exists config_ui_sections (
  section_key text primary key,
  label text not null,
  route text not null,
  user_enabled boolean not null default true,
  admin_enabled boolean not null default true,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

insert into config_ui_sections (section_key, label, route, user_enabled, admin_enabled, sort_order)
values
  ('dashboard', 'Dashboard', '/', true, true, 10),
  ('leads', 'Lead', '/leads', true, true, 20),
  ('orders', 'Ordini', '/orders', true, true, 30),
  ('sidial_history', 'Storico SIDIAL', '/sidial-history', false, true, 40),
  ('clients_campaigns', 'Clienti & Campagne', '/clients-campaigns', false, true, 50),
  ('settings', 'Impostazioni', '/settings', false, true, 60)
on conflict (section_key) do nothing;
