import { dbQuery } from '../lib/db.js';

export function sidialStoreEnabled() {
  const mode = String(process.env.SIDIAL_PERSISTENCE || 'db').toLowerCase().trim();
  return mode === 'db' && !!process.env.DATABASE_URL;
}

function fromRowPayload(row) {
  const base = row.payload && typeof row.payload === 'object' ? row.payload : {};
  return {
    ...base,
    id: row.sidial_id,
    createdWhen: row.created_when || base.createdWhen || base.createWhen || null,
    source: row.source || base.source || null,
    clientId: row.client_id || base.clientId || null,
    campaignId: row.campaign_id || base.campaignId || null,
    brand: row.client_id || base.brand || null,
    campaignName: row.campaign_name || base.campaignName || null,
    listName: row.list_name || base.listName || null,
    internalCampaignName: row.internal_campaign_name || base.internalCampaignName || null,
    details_loaded: row.details_loaded ? 'yes' : (base.details_loaded || null)
  };
}

export async function getSyncState(cacheKey) {
  const res = await dbQuery(
    `select cache_key, status, rows_count, last_sync_at, message, meta
     from sidial_sync_state where cache_key = $1`,
    [cacheKey]
  );
  return res.rows?.[0] || null;
}

export async function upsertSyncState(cacheKey, { status, rowsCount = 0, message = null, meta = null }) {
  await dbQuery(
    `insert into sidial_sync_state (cache_key, status, rows_count, last_sync_at, message, meta, updated_at)
     values ($1, $2, $3, now(), $4, $5, now())
     on conflict (cache_key)
     do update set
       status = excluded.status,
       rows_count = excluded.rows_count,
       last_sync_at = excluded.last_sync_at,
       message = excluded.message,
       meta = excluded.meta,
       updated_at = excluded.updated_at`,
    [cacheKey, status, rowsCount, message, meta]
  );
}

export async function upsertLeads(leads = []) {
  if (!Array.isArray(leads) || leads.length === 0) return;

  for (const lead of leads) {
    const id = String(lead.id || '').trim();
    if (!id) continue;

    await dbQuery(
      `insert into sidial_leads
        (sidial_id, created_when, source, client_id, campaign_id, campaign_name, list_name, internal_campaign_name, payload, first_seen_at, last_seen_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, now(), now())
       on conflict (sidial_id)
       do update set
         created_when = excluded.created_when,
         source = excluded.source,
         client_id = excluded.client_id,
         campaign_id = excluded.campaign_id,
         campaign_name = excluded.campaign_name,
         list_name = excluded.list_name,
         internal_campaign_name = excluded.internal_campaign_name,
         payload = excluded.payload,
         last_seen_at = now()`,
      [
        id,
        lead.createdWhen || null,
        lead.source || null,
        lead.clientId || lead.brand || null,
        lead.campaignId || null,
        lead.campaignName || null,
        lead.listName || null,
        lead.internalCampaignName || null,
        JSON.stringify(lead)
      ]
    );
  }
}

export async function getLeadsByRange({ source, dateFrom, dateTo }) {
  const res = await dbQuery(
    `select sidial_id, created_when, source, client_id, campaign_id, campaign_name, list_name, internal_campaign_name, payload, false as details_loaded
     from sidial_leads
     where source = $1
       and created_when >= $2
       and created_when <= $3
     order by created_when desc nulls last`,
    [source, dateFrom, dateTo]
  );

  return res.rows.map(fromRowPayload);
}

export async function getLeadsHistory({ dateFrom, dateTo, source = null }) {
  if (source) return getLeadsByRange({ source, dateFrom, dateTo });

  const res = await dbQuery(
    `select sidial_id, created_when, source, client_id, campaign_id, campaign_name, list_name, internal_campaign_name, payload, false as details_loaded
     from sidial_leads
     where created_when >= $1
       and created_when <= $2
     order by created_when desc nulls last`,
    [dateFrom, dateTo]
  );
  return res.rows.map(fromRowPayload);
}

export async function upsertOrders(orders = []) {
  if (!Array.isArray(orders) || orders.length === 0) return;

  for (const order of orders) {
    const id = String(order.id || '').trim();
    if (!id) continue;

    await dbQuery(
      `insert into sidial_orders
        (sidial_id, created_when, source, client_id, campaign_id, campaign_name, list_name, internal_campaign_name, details_loaded, payload, first_seen_at, last_seen_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, now(), now())
       on conflict (sidial_id)
       do update set
         created_when = excluded.created_when,
         source = excluded.source,
         client_id = excluded.client_id,
         campaign_id = excluded.campaign_id,
         campaign_name = excluded.campaign_name,
         list_name = excluded.list_name,
         internal_campaign_name = excluded.internal_campaign_name,
         details_loaded = sidial_orders.details_loaded or excluded.details_loaded,
         payload = excluded.payload,
         last_seen_at = now()`,
      [
        id,
        order.createdWhen || order.createWhen || order.date || null,
        order.source || null,
        order.clientId || order.brand || null,
        order.campaignId || null,
        order.campaignName || null,
        order.listName || null,
        order.internalCampaignName || null,
        String(order.details_loaded || '').toLowerCase() === 'yes',
        JSON.stringify(order)
      ]
    );
  }
}

export async function getOrdersByRange({ dateFrom, dateTo, includeUnattributed = false }) {
  const res = await dbQuery(
    `select sidial_id,
            coalesce(
              created_when,
              nullif(payload->>'createdWhen', ''),
              nullif(payload->>'createWhen', ''),
              nullif(payload->>'date', '')
            ) as created_when,
            source, client_id, campaign_id, campaign_name, list_name, internal_campaign_name, details_loaded, payload
     from sidial_orders
     where coalesce(
             created_when,
             nullif(payload->>'createdWhen', ''),
             nullif(payload->>'createWhen', ''),
             nullif(payload->>'date', '')
           ) >= $1
       and coalesce(
             created_when,
             nullif(payload->>'createdWhen', ''),
             nullif(payload->>'createWhen', ''),
             nullif(payload->>'date', '')
           ) <= $2
     order by created_when desc nulls last`,
    [dateFrom, dateTo]
  );

  const mapped = res.rows.map(fromRowPayload);
  if (includeUnattributed) return mapped;
  return mapped.filter((o) => o.source && (o.clientId || o.brand));
}

export async function getLastSyncByPrefix(prefix) {
  const res = await dbQuery(
    `select max(last_sync_at) as last_sync_at
     from sidial_sync_state
     where cache_key like $1`,
    [`${prefix}%`]
  );
  return res.rows?.[0]?.last_sync_at || null;
}

export async function upsertOrderDetails({
  orderId,
  detailsPayload,
  listName,
  campaignName,
  source,
  clientId,
  campaignId,
  internalCampaignName
}) {
  const id = String(orderId || '').trim();
  if (!id) return;

  await dbQuery(
    `insert into sidial_order_details
      (sidial_order_id, payload, list_name, campaign_name, source, client_id, campaign_id, internal_campaign_name, fetched_at, updated_at)
     values ($1, $2::jsonb, $3, $4, $5, $6, $7, $8, now(), now())
     on conflict (sidial_order_id)
     do update set
       payload = excluded.payload,
       list_name = excluded.list_name,
       campaign_name = excluded.campaign_name,
       source = excluded.source,
       client_id = excluded.client_id,
       campaign_id = excluded.campaign_id,
       internal_campaign_name = excluded.internal_campaign_name,
       fetched_at = excluded.fetched_at,
       updated_at = excluded.updated_at`,
    [
      id,
      JSON.stringify(detailsPayload),
      listName || null,
      campaignName || null,
      source || null,
      clientId || null,
      campaignId || null,
      internalCampaignName || null
    ]
  );

  await dbQuery(
    `update sidial_orders
     set list_name = coalesce($2, list_name),
         campaign_name = coalesce($3, campaign_name),
         source = coalesce($4, source),
         client_id = coalesce($5, client_id),
         campaign_id = coalesce($6, campaign_id),
         internal_campaign_name = coalesce($7, internal_campaign_name),
         details_loaded = true,
         payload = jsonb_set(coalesce(payload, '{}'::jsonb), '{details_loaded}', '"yes"'::jsonb, true),
         last_seen_at = now()
     where sidial_id = $1`,
    [
      id,
      listName || null,
      campaignName || null,
      source || null,
      clientId || null,
      campaignId || null,
      internalCampaignName || null
    ]
  );
}
