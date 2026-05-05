alter table sidial_leads
  add column if not exists campaign_id text;

alter table sidial_orders
  add column if not exists campaign_id text;

alter table sidial_order_details
  add column if not exists campaign_id text;

create index if not exists idx_sidial_leads_campaign
on sidial_leads (campaign_id, source, created_when);

create index if not exists idx_sidial_orders_campaign
on sidial_orders (campaign_id, source, created_when);
