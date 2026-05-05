import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { getCampaignConfig } from '../src/services/campaignConfigService.js';
import { withDbTransaction } from '../src/lib/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

function normalizeConfig(config) {
  const clients = Array.isArray(config.clients) ? config.clients : [];
  const campaigns = Array.isArray(config.campaigns) ? config.campaigns : [];
  const leadMappings = Array.isArray(config?.sidial?.leadMappings) ? config.sidial.leadMappings : [];
  const orderListMappings = Array.isArray(config?.sidial?.orderListMappings) ? config.sidial.orderListMappings : [];
  const metaRules = Array.isArray(config?.meta?.attributionRules) ? config.meta.attributionRules : [];
  const googleRules = Array.isArray(config?.google?.attributionRules) ? config.google.attributionRules : [];
  return { clients, campaigns, leadMappings, orderListMappings, metaRules, googleRules };
}

async function run() {
  process.env.CONFIG_STORAGE = 'file';
  const config = await getCampaignConfig();
  const { clients, campaigns, leadMappings, orderListMappings, metaRules, googleRules } = normalizeConfig(config);

  await withDbTransaction(async (client) => {
    await client.query('delete from config_sidial_lead_mappings');
    await client.query('delete from config_sidial_order_list_mappings');
    await client.query('delete from config_attribution_rules');
    await client.query('delete from config_campaigns');
    await client.query('delete from config_clients');

    for (const c of clients) {
      await client.query(
        `insert into config_clients (id, name, active) values ($1, $2, $3)`,
        [String(c.id), String(c.name || c.id), c.active !== false]
      );
    }

    for (const c of campaigns) {
      await client.query(
        `insert into config_campaigns (id, client_id, name, active, allow_internal_leads)
         values ($1, $2, $3, $4, $5)`,
        [
          String(c.id),
          String(c.clientId),
          String(c.name || c.id),
          c.active !== false,
          c.allowInternalLeads !== false
        ]
      );
    }

    for (const m of leadMappings) {
      await client.query(
        `insert into config_sidial_lead_mappings
          (id, campaign_id, active, source, client_id, sidial_campaign_id, sidial_list_id, internal_campaign_name, list_label)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          String(m.id),
          m.campaignId || null,
          m.active !== false,
          String(m.source || '').toLowerCase(),
          String(m.clientId),
          String(m.sidialCampaignId),
          String(m.sidialListId),
          m.internalCampaignName || null,
          m.listLabel || null
        ]
      );
    }

    for (const m of orderListMappings) {
      await client.query(
        `insert into config_sidial_order_list_mappings
          (id, campaign_id, active, source, client_id, sidial_list_name, internal_campaign_name)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          String(m.id),
          m.campaignId || null,
          m.active !== false,
          String(m.source || '').toLowerCase(),
          String(m.clientId),
          String(m.sidialListName),
          m.internalCampaignName || null
        ]
      );
    }

    for (const rule of metaRules) {
      await client.query(
        `insert into config_attribution_rules
          (id, campaign_id, channel, active, client_id, match_type, match_value, internal_campaign_name)
         values ($1, $2, 'meta', $3, $4, $5, $6, $7)`,
        [
          String(rule.id),
          rule.campaignId || null,
          rule.active !== false,
          String(rule.clientId),
          String(rule.matchType || 'contains'),
          String(rule.matchValue || ''),
          rule.internalCampaignName || null
        ]
      );
    }

    for (const rule of googleRules) {
      await client.query(
        `insert into config_attribution_rules
          (id, campaign_id, channel, active, client_id, match_type, match_value, internal_campaign_name)
         values ($1, $2, 'google', $3, $4, $5, $6, $7)`,
        [
          String(rule.id),
          rule.campaignId || null,
          rule.active !== false,
          String(rule.clientId),
          String(rule.matchType || 'contains'),
          String(rule.matchValue || ''),
          rule.internalCampaignName || null
        ]
      );
    }

    await client.query('update config_meta set version = $1, updated_at = now() where id = 1', [Number(config.version || 1)]);
  });

  console.log('seed config completed');
}

run().catch((err) => {
  console.error('seed error:', err.message);
  process.exit(1);
});
