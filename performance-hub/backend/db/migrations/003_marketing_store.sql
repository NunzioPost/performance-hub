create table if not exists marketing_sync_state (
  cache_key text primary key,
  channel text not null check (channel in ('meta', 'google')),
  status text not null,
  rows_count integer not null default 0,
  last_sync_at timestamptz not null default now(),
  message text,
  meta jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists idx_marketing_sync_channel
on marketing_sync_state (channel, last_sync_at desc);

create table if not exists marketing_insights_cache (
  channel text not null check (channel in ('meta', 'google')),
  date_from date not null,
  date_to date not null,
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (channel, date_from, date_to)
);

create index if not exists idx_marketing_cache_channel_dates
on marketing_insights_cache (channel, date_from, date_to);

create table if not exists marketing_daily_snapshots (
  id bigserial primary key,
  channel text not null check (channel in ('meta', 'google')),
  metric_date date not null,
  campaign_id text,
  campaign_name text,
  client_id text,
  internal_campaign_name text,
  spend numeric(14, 2) not null default 0,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  leads integer not null default 0,
  snapshot_at timestamptz not null default now(),
  payload jsonb
);

create index if not exists idx_marketing_daily_channel_date
on marketing_daily_snapshots (channel, metric_date desc);

create index if not exists idx_marketing_daily_client
on marketing_daily_snapshots (channel, client_id, metric_date desc);
