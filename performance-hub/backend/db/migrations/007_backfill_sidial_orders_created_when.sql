update sidial_orders
set created_when = coalesce(
  created_when,
  nullif(payload->>'createdWhen', ''),
  nullif(payload->>'createWhen', ''),
  nullif(payload->>'date', '')
)
where created_when is null;

create index if not exists idx_sidial_orders_created_when
on sidial_orders (created_when desc);
