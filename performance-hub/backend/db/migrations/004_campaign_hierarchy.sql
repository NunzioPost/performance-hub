create table if not exists config_campaigns (
  id text primary key,
  client_id text not null references config_clients(id) on update cascade on delete cascade,
  name text not null,
  active boolean not null default true,
  allow_internal_leads boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table config_sidial_lead_mappings
  add column if not exists campaign_id text references config_campaigns(id) on update cascade on delete set null;

alter table config_sidial_order_list_mappings
  add column if not exists campaign_id text references config_campaigns(id) on update cascade on delete set null;

alter table config_attribution_rules
  add column if not exists campaign_id text references config_campaigns(id) on update cascade on delete set null;

create index if not exists idx_config_campaigns_client
on config_campaigns (client_id, active);

create index if not exists idx_sidial_lead_campaign
on config_sidial_lead_mappings (campaign_id, source, active);

create index if not exists idx_sidial_order_campaign
on config_sidial_order_list_mappings (campaign_id, source, active);

create index if not exists idx_attr_campaign_channel
on config_attribution_rules (campaign_id, channel, active);
