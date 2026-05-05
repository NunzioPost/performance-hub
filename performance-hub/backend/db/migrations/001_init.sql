create table if not exists config_clients (
  id text primary key,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists config_sidial_lead_mappings (
  id text primary key,
  active boolean not null default true,
  source text not null check (source in ('google', 'meta')),
  client_id text not null references config_clients(id) on update cascade on delete restrict,
  sidial_campaign_id text not null,
  sidial_list_id text not null,
  internal_campaign_name text,
  list_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sidial_lead_source_active
on config_sidial_lead_mappings (source, active);

create table if not exists config_sidial_order_list_mappings (
  id text primary key,
  active boolean not null default true,
  source text not null check (source in ('google', 'meta')),
  client_id text not null references config_clients(id) on update cascade on delete restrict,
  sidial_list_name text not null,
  internal_campaign_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sidial_order_list_lower
on config_sidial_order_list_mappings ((lower(trim(sidial_list_name))));

create table if not exists config_attribution_rules (
  id text primary key,
  channel text not null check (channel in ('google', 'meta')),
  active boolean not null default true,
  client_id text not null references config_clients(id) on update cascade on delete restrict,
  match_type text not null check (match_type in ('contains', 'equals', 'regex')),
  match_value text not null,
  internal_campaign_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_attr_channel_active
on config_attribution_rules (channel, active);

create table if not exists config_meta (
  id smallint primary key,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

insert into config_meta (id, version)
values (1, 1)
on conflict (id) do nothing;
