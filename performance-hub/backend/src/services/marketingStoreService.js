import { dbQuery } from '../lib/db.js';

export function marketingStoreEnabled() {
  const mode = String(process.env.MARKETING_PERSISTENCE || 'db').toLowerCase().trim();
  return mode === 'db' && !!process.env.DATABASE_URL;
}

export async function getMarketingSyncState(cacheKey) {
  const res = await dbQuery(
    `select cache_key, channel, status, rows_count, last_sync_at, message, meta
     from marketing_sync_state where cache_key = $1`,
    [cacheKey]
  );
  return res.rows?.[0] || null;
}

export async function upsertMarketingSyncState(cacheKey, channel, { status, rowsCount = 0, message = null, meta = null }) {
  await dbQuery(
    `insert into marketing_sync_state (cache_key, channel, status, rows_count, last_sync_at, message, meta, updated_at)
     values ($1, $2, $3, $4, now(), $5, $6, now())
     on conflict (cache_key)
     do update set
       channel = excluded.channel,
       status = excluded.status,
       rows_count = excluded.rows_count,
       last_sync_at = excluded.last_sync_at,
       message = excluded.message,
       meta = excluded.meta,
       updated_at = excluded.updated_at`,
    [cacheKey, channel, status, rowsCount, message, meta]
  );
}

export async function getMarketingCachedInsights(channel, dateFrom, dateTo) {
  const res = await dbQuery(
    `select payload, fetched_at
     from marketing_insights_cache
     where channel = $1 and date_from = $2::date and date_to = $3::date`,
    [channel, dateFrom, dateTo]
  );
  if (!res.rows?.[0]) return null;
  return {
    payload: res.rows[0].payload,
    fetchedAt: res.rows[0].fetched_at
  };
}

export async function upsertMarketingCachedInsights(channel, dateFrom, dateTo, payload) {
  await dbQuery(
    `insert into marketing_insights_cache
      (channel, date_from, date_to, payload, fetched_at, updated_at)
     values ($1, $2::date, $3::date, $4::jsonb, now(), now())
     on conflict (channel, date_from, date_to)
     do update set
       payload = excluded.payload,
       fetched_at = excluded.fetched_at,
       updated_at = excluded.updated_at`,
    [channel, dateFrom, dateTo, JSON.stringify(payload)]
  );
}

export async function insertMarketingDailySnapshots(channel, rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) return;

  for (const row of rows) {
    const metricDate = String(row.date || '').slice(0, 10);
    if (!metricDate) continue;

    await dbQuery(
      `insert into marketing_daily_snapshots
        (channel, metric_date, campaign_id, campaign_name, client_id, crm_campaign_id, crm_campaign_name, internal_campaign_name, spend, impressions, clicks, leads, snapshot_at, payload)
       values ($1, $2::date, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now(), $13::jsonb)`,
      [
        channel,
        metricDate,
        row.campaignId || null,
        row.campaignName || null,
        row.clientId || null,
        row.crmCampaignId || null,
        row.crmCampaignName || null,
        row.internalCampaignName || null,
        Number(row.spend || 0),
        Number(row.impressions || 0),
        Number(row.clicks || 0),
        Number(row.leads || 0),
        JSON.stringify(row)
      ]
    );
  }
}
