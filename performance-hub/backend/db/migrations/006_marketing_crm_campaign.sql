alter table marketing_daily_snapshots
  add column if not exists crm_campaign_id text;

alter table marketing_daily_snapshots
  add column if not exists crm_campaign_name text;

create index if not exists idx_marketing_daily_crm_campaign
on marketing_daily_snapshots (channel, crm_campaign_id, metric_date desc);
