create table if not exists sidial_sync_state (
  cache_key text primary key,
  status text not null,
  rows_count integer not null default 0,
  last_sync_at timestamptz not null default now(),
  message text,
  meta jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists sidial_leads (
  sidial_id text primary key,
  created_when text,
  source text,
  client_id text,
  campaign_name text,
  list_name text,
  internal_campaign_name text,
  payload jsonb not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists idx_sidial_leads_source_created
on sidial_leads (source, created_when);

create table if not exists sidial_orders (
  sidial_id text primary key,
  created_when text,
  source text,
  client_id text,
  campaign_name text,
  list_name text,
  internal_campaign_name text,
  details_loaded boolean not null default false,
  payload jsonb not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists idx_sidial_orders_created
on sidial_orders (created_when);

create index if not exists idx_sidial_orders_source_client
on sidial_orders (source, client_id);

create table if not exists sidial_order_details (
  sidial_order_id text primary key references sidial_orders(sidial_id) on delete cascade,
  payload jsonb not null,
  list_name text,
  campaign_name text,
  source text,
  client_id text,
  internal_campaign_name text,
  fetched_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
