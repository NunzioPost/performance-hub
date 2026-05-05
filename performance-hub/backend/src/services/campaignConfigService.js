import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dbEnabled, dbQuery, withDbTransaction } from '../lib/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const CONFIG_PATH = path.resolve(DATA_DIR, 'campaign-config.json');

const DEFAULT_CONFIG = {
  version: 2,
  clients: [
    { id: 'wind', name: 'Wind', active: true },
    { id: 'vodafone', name: 'Vodafone', active: true }
  ],
  campaigns: [
    {
      id: 'wind_fibra',
      clientId: 'wind',
      name: 'Wind Fibra',
      active: true,
      allowInternalLeads: true,
      sidial: {
        leadMappings: [
          {
            id: 'wind_google_sidial',
            active: true,
            source: 'google',
            sidialCampaignId: '135',
            sidialListId: '1719',
            listLabel: 'Wind Google',
            internalCampaignName: 'Wind Fibra Google'
          },
          {
            id: 'wind_meta_sidial',
            active: true,
            source: 'meta',
            sidialCampaignId: '135',
            sidialListId: '1769',
            listLabel: 'Wind Meta',
            internalCampaignName: 'Wind Fibra Meta'
          }
        ],
        orderListMappings: [
          {
            id: 'wind_google_orders',
            active: true,
            source: 'google',
            sidialListName: 'Leads WIND WCC',
            internalCampaignName: 'Wind Fibra Google'
          },
          {
            id: 'wind_meta_orders',
            active: true,
            source: 'meta',
            sidialListName: 'Leads Wind Proprie_2',
            internalCampaignName: 'Wind Fibra Meta'
          }
        ]
      },
      attribution: {
        googleRules: [
          {
            id: 'google_wind_fibra_contains',
            active: true,
            matchType: 'contains',
            matchValue: 'wind',
            internalCampaignName: 'Wind Fibra Google'
          }
        ],
        metaRules: [
          {
            id: 'meta_wind_fibra_contains',
            active: true,
            matchType: 'contains',
            matchValue: 'wind',
            internalCampaignName: 'Wind Fibra Meta'
          }
        ]
      }
    },
    {
      id: 'vodafone_fibra',
      clientId: 'vodafone',
      name: 'Vodafone Fibra',
      active: true,
      allowInternalLeads: true,
      sidial: {
        leadMappings: [
          {
            id: 'vodafone_google_sidial',
            active: true,
            source: 'google',
            sidialCampaignId: '32',
            sidialListId: '1671',
            listLabel: 'Vodafone Google',
            internalCampaignName: 'Vodafone Fibra Google'
          },
          {
            id: 'vodafone_meta_sidial',
            active: true,
            source: 'meta',
            sidialCampaignId: '32',
            sidialListId: '1770',
            listLabel: 'Vodafone Meta',
            internalCampaignName: 'Vodafone Fibra Meta'
          }
        ],
        orderListMappings: [
          {
            id: 'vodafone_google_orders',
            active: true,
            source: 'google',
            sidialListName: 'Leads Vodafone WCC',
            internalCampaignName: 'Vodafone Fibra Google'
          },
          {
            id: 'vodafone_meta_orders',
            active: true,
            source: 'meta',
            sidialListName: 'Vodafone Lead Proprie_2',
            internalCampaignName: 'Vodafone Fibra Meta'
          }
        ]
      },
      attribution: {
        googleRules: [
          {
            id: 'google_vodafone_fibra_contains',
            active: true,
            matchType: 'contains',
            matchValue: 'vodafone',
            internalCampaignName: 'Vodafone Fibra Google'
          }
        ],
        metaRules: [
          {
            id: 'meta_vodafone_fibra_contains',
            active: true,
            matchType: 'contains',
            matchValue: 'vodafone',
            internalCampaignName: 'Vodafone Fibra Meta'
          }
        ]
      }
    }
  ],
  sidial: { leadMappings: [], orderListMappings: [] },
  meta: { attributionRules: [] },
  google: { attributionRules: [] }
};

let cache = null;

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function normalizeText(value) {
  return String(value || '').toLowerCase().trim();
}

function uniqueById(items = []) {
  const map = new Map();
  for (const item of items) {
    const id = String(item?.id || '').trim();
    if (!id) continue;
    if (!map.has(id)) map.set(id, item);
  }
  return Array.from(map.values());
}

function ensureArrays(config) {
  const c = config || {};
  c.version = Number(c.version || 1);
  c.clients = Array.isArray(c.clients) ? c.clients : [];
  c.campaigns = Array.isArray(c.campaigns) ? c.campaigns : [];

  c.sidial = c.sidial || {};
  c.sidial.leadMappings = Array.isArray(c.sidial.leadMappings) ? c.sidial.leadMappings : [];
  c.sidial.orderListMappings = Array.isArray(c.sidial.orderListMappings) ? c.sidial.orderListMappings : [];

  c.meta = c.meta || {};
  c.meta.attributionRules = Array.isArray(c.meta.attributionRules) ? c.meta.attributionRules : [];

  c.google = c.google || {};
  c.google.attributionRules = Array.isArray(c.google.attributionRules) ? c.google.attributionRules : [];

  return c;
}

function inferDefaultCampaignName(client) {
  const cid = normalizeText(client?.id);
  if (cid === 'wind') return 'Wind Fibra';
  if (cid === 'vodafone') return 'Vodafone Fibra';
  return `${client?.name || client?.id || 'Campagna'} Main`;
}

function buildCampaignsFromLegacy(config) {
  if (Array.isArray(config.campaigns) && config.campaigns.length > 0) {
    return config.campaigns;
  }

  const byClient = new Map();
  for (const client of config.clients) {
    const id = String(client.id || '').trim();
    if (!id) continue;
    byClient.set(id, {
      id: `${id}_main`,
      clientId: id,
      name: inferDefaultCampaignName(client),
      active: client.active !== false,
      allowInternalLeads: true,
      sidial: { leadMappings: [], orderListMappings: [] },
      attribution: { googleRules: [], metaRules: [] }
    });
  }

  for (const m of config.sidial.leadMappings || []) {
    const cid = String(m.clientId || '').trim();
    if (!cid || !byClient.has(cid)) continue;
    byClient.get(cid).sidial.leadMappings.push({
      id: m.id,
      active: m.active !== false,
      source: m.source,
      sidialCampaignId: m.sidialCampaignId,
      sidialListId: m.sidialListId,
      listLabel: m.listLabel,
      internalCampaignName: m.internalCampaignName
    });
  }

  for (const m of config.sidial.orderListMappings || []) {
    const cid = String(m.clientId || '').trim();
    if (!cid || !byClient.has(cid)) continue;
    byClient.get(cid).sidial.orderListMappings.push({
      id: m.id,
      active: m.active !== false,
      source: m.source,
      sidialListName: m.sidialListName,
      internalCampaignName: m.internalCampaignName
    });
  }

  for (const r of config.google.attributionRules || []) {
    const cid = String(r.clientId || '').trim();
    if (!cid || !byClient.has(cid)) continue;
    byClient.get(cid).attribution.googleRules.push({
      id: r.id,
      active: r.active !== false,
      matchType: r.matchType,
      matchValue: r.matchValue,
      internalCampaignName: r.internalCampaignName
    });
  }

  for (const r of config.meta.attributionRules || []) {
    const cid = String(r.clientId || '').trim();
    if (!cid || !byClient.has(cid)) continue;
    byClient.get(cid).attribution.metaRules.push({
      id: r.id,
      active: r.active !== false,
      matchType: r.matchType,
      matchValue: r.matchValue,
      internalCampaignName: r.internalCampaignName
    });
  }

  return Array.from(byClient.values());
}

function normalizeCampaignStructure(campaigns = []) {
  return campaigns
    .filter((c) => c && c.id && c.clientId)
    .map((c) => ({
      id: String(c.id),
      clientId: String(c.clientId),
      name: String(c.name || c.id),
      active: c.active !== false,
      allowInternalLeads: c.allowInternalLeads !== false,
      sidial: {
        leadMappings: Array.isArray(c?.sidial?.leadMappings) ? c.sidial.leadMappings : [],
        orderListMappings: Array.isArray(c?.sidial?.orderListMappings) ? c.sidial.orderListMappings : []
      },
      attribution: {
        googleRules: Array.isArray(c?.attribution?.googleRules) ? c.attribution.googleRules : [],
        metaRules: Array.isArray(c?.attribution?.metaRules) ? c.attribution.metaRules : []
      }
    }));
}

function flattenCampaignMappings(config) {
  const leadMappings = [];
  const orderListMappings = [];
  const googleRules = [];
  const metaRules = [];

  for (const campaign of config.campaigns) {
    const cname = campaign.name;

    for (const m of campaign.sidial.leadMappings) {
      leadMappings.push({
        id: String(m.id || `${campaign.id}_${m.source || 'unknown'}_${m.sidialListId || 'list'}`),
        campaignId: campaign.id,
        clientId: campaign.clientId,
        active: m.active !== false,
        source: String(m.source || '').toLowerCase(),
        sidialCampaignId: String(m.sidialCampaignId || ''),
        sidialListId: String(m.sidialListId || ''),
        listLabel: m.listLabel || null,
        internalCampaignName: m.internalCampaignName || `${cname} ${String(m.source || '').toUpperCase()}`
      });
    }

    for (const m of campaign.sidial.orderListMappings) {
      orderListMappings.push({
        id: String(m.id || `${campaign.id}_${m.source || 'unknown'}_orders`),
        campaignId: campaign.id,
        clientId: campaign.clientId,
        active: m.active !== false,
        source: String(m.source || '').toLowerCase(),
        sidialListName: String(m.sidialListName || ''),
        internalCampaignName: m.internalCampaignName || `${cname} ${String(m.source || '').toUpperCase()}`
      });
    }

    for (const r of campaign.attribution.googleRules) {
      googleRules.push({
        id: String(r.id || `${campaign.id}_google_rule_${Math.random().toString(36).slice(2, 8)}`),
        campaignId: campaign.id,
        clientId: campaign.clientId,
        active: r.active !== false,
        matchType: r.matchType || 'contains',
        matchValue: String(r.matchValue || ''),
        internalCampaignName: r.internalCampaignName || `${cname} Google`
      });
    }

    for (const r of campaign.attribution.metaRules) {
      metaRules.push({
        id: String(r.id || `${campaign.id}_meta_rule_${Math.random().toString(36).slice(2, 8)}`),
        campaignId: campaign.id,
        clientId: campaign.clientId,
        active: r.active !== false,
        matchType: r.matchType || 'contains',
        matchValue: String(r.matchValue || ''),
        internalCampaignName: r.internalCampaignName || `${cname} Meta`
      });
    }
  }

  const lead = uniqueById([...leadMappings, ...(config.sidial.leadMappings || [])]);
  const order = uniqueById([...orderListMappings, ...(config.sidial.orderListMappings || [])]);
  const google = uniqueById([...googleRules, ...(config.google.attributionRules || [])]);
  const meta = uniqueById([...metaRules, ...(config.meta.attributionRules || [])]);

  return { leadMappings: lead, orderListMappings: order, googleRules: google, metaRules: meta };
}

function normalizeConfig(config) {
  const c = ensureArrays(clone(config));
  c.campaigns = normalizeCampaignStructure(buildCampaignsFromLegacy(c));

  const flat = flattenCampaignMappings(c);
  c.sidial.leadMappings = flat.leadMappings;
  c.sidial.orderListMappings = flat.orderListMappings;
  c.google.attributionRules = flat.googleRules;
  c.meta.attributionRules = flat.metaRules;

  return c;
}

function ensureConfigFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf8');
  }
}

function loadConfigFromFile() {
  ensureConfigFile();
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  return normalizeConfig(JSON.parse(raw));
}

async function loadConfigFromDb() {
  const [
    metaRes,
    clientsRes,
    campaignsRes,
    leadRes,
    orderRes,
    rulesRes
  ] = await Promise.all([
    dbQuery('select version from config_meta where id = 1'),
    dbQuery('select id, name, active from config_clients order by name asc'),
    dbQuery('select id, client_id, name, active, allow_internal_leads from config_campaigns order by name asc'),
    dbQuery(`select id, campaign_id, active, source, client_id, sidial_campaign_id, sidial_list_id, internal_campaign_name, list_label
             from config_sidial_lead_mappings
             order by id asc`),
    dbQuery(`select id, campaign_id, active, source, client_id, sidial_list_name, internal_campaign_name
             from config_sidial_order_list_mappings
             order by id asc`),
    dbQuery(`select id, campaign_id, channel, active, client_id, match_type, match_value, internal_campaign_name
             from config_attribution_rules
             order by channel asc, id asc`)
  ]);

  const version = Number(metaRes.rows?.[0]?.version || 1);
  const clients = clientsRes.rows.map((r) => ({ id: r.id, name: r.name, active: r.active !== false }));

  const campaigns = campaignsRes.rows.map((r) => ({
    id: r.id,
    clientId: r.client_id,
    name: r.name,
    active: r.active !== false,
    allowInternalLeads: r.allow_internal_leads !== false,
    sidial: { leadMappings: [], orderListMappings: [] },
    attribution: { googleRules: [], metaRules: [] }
  }));

  const campaignMap = new Map(campaigns.map((c) => [c.id, c]));

  const leadMappings = leadRes.rows.map((r) => ({
    id: r.id,
    campaignId: r.campaign_id || null,
    active: r.active !== false,
    source: r.source,
    clientId: r.client_id,
    sidialCampaignId: r.sidial_campaign_id,
    sidialListId: r.sidial_list_id,
    internalCampaignName: r.internal_campaign_name,
    listLabel: r.list_label
  }));

  const orderListMappings = orderRes.rows.map((r) => ({
    id: r.id,
    campaignId: r.campaign_id || null,
    active: r.active !== false,
    source: r.source,
    clientId: r.client_id,
    sidialListName: r.sidial_list_name,
    internalCampaignName: r.internal_campaign_name
  }));

  const googleRules = rulesRes.rows
    .filter((r) => r.channel === 'google')
    .map((r) => ({
      id: r.id,
      campaignId: r.campaign_id || null,
      active: r.active !== false,
      clientId: r.client_id,
      matchType: r.match_type,
      matchValue: r.match_value,
      internalCampaignName: r.internal_campaign_name
    }));

  const metaRules = rulesRes.rows
    .filter((r) => r.channel === 'meta')
    .map((r) => ({
      id: r.id,
      campaignId: r.campaign_id || null,
      active: r.active !== false,
      clientId: r.client_id,
      matchType: r.match_type,
      matchValue: r.match_value,
      internalCampaignName: r.internal_campaign_name
    }));

  for (const m of leadMappings) {
    if (m.campaignId && campaignMap.has(m.campaignId)) {
      campaignMap.get(m.campaignId).sidial.leadMappings.push({
        id: m.id,
        active: m.active,
        source: m.source,
        sidialCampaignId: m.sidialCampaignId,
        sidialListId: m.sidialListId,
        internalCampaignName: m.internalCampaignName,
        listLabel: m.listLabel
      });
    }
  }

  for (const m of orderListMappings) {
    if (m.campaignId && campaignMap.has(m.campaignId)) {
      campaignMap.get(m.campaignId).sidial.orderListMappings.push({
        id: m.id,
        active: m.active,
        source: m.source,
        sidialListName: m.sidialListName,
        internalCampaignName: m.internalCampaignName
      });
    }
  }

  for (const r of googleRules) {
    if (r.campaignId && campaignMap.has(r.campaignId)) {
      campaignMap.get(r.campaignId).attribution.googleRules.push({
        id: r.id,
        active: r.active,
        matchType: r.matchType,
        matchValue: r.matchValue,
        internalCampaignName: r.internalCampaignName
      });
    }
  }

  for (const r of metaRules) {
    if (r.campaignId && campaignMap.has(r.campaignId)) {
      campaignMap.get(r.campaignId).attribution.metaRules.push({
        id: r.id,
        active: r.active,
        matchType: r.matchType,
        matchValue: r.matchValue,
        internalCampaignName: r.internalCampaignName
      });
    }
  }

  return normalizeConfig({
    version,
    clients,
    campaigns,
    sidial: { leadMappings, orderListMappings },
    meta: { attributionRules: metaRules },
    google: { attributionRules: googleRules }
  });
}

async function saveConfigToDb(config) {
  const normalized = normalizeConfig(config);

  await withDbTransaction(async (client) => {
    await client.query('delete from config_sidial_lead_mappings');
    await client.query('delete from config_sidial_order_list_mappings');
    await client.query('delete from config_attribution_rules');
    await client.query('delete from config_campaigns');
    await client.query('delete from config_clients');

    for (const c of normalized.clients) {
      await client.query(
        `insert into config_clients (id, name, active, updated_at)
         values ($1, $2, $3, now())`,
        [String(c.id), String(c.name || c.id), c.active !== false]
      );
    }

    for (const c of normalized.campaigns) {
      await client.query(
        `insert into config_campaigns (id, client_id, name, active, allow_internal_leads, updated_at)
         values ($1, $2, $3, $4, $5, now())`,
        [String(c.id), String(c.clientId), String(c.name || c.id), c.active !== false, c.allowInternalLeads !== false]
      );
    }

    for (const m of normalized.sidial.leadMappings) {
      await client.query(
        `insert into config_sidial_lead_mappings
          (id, campaign_id, active, source, client_id, sidial_campaign_id, sidial_list_id, internal_campaign_name, list_label, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())`,
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

    for (const m of normalized.sidial.orderListMappings) {
      await client.query(
        `insert into config_sidial_order_list_mappings
          (id, campaign_id, active, source, client_id, sidial_list_name, internal_campaign_name, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, now())`,
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

    const insertRule = async (channel, rule) => {
      await client.query(
        `insert into config_attribution_rules
          (id, campaign_id, channel, active, client_id, match_type, match_value, internal_campaign_name, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, now())`,
        [
          String(rule.id),
          rule.campaignId || null,
          channel,
          rule.active !== false,
          String(rule.clientId),
          String(rule.matchType || 'contains'),
          String(rule.matchValue || ''),
          rule.internalCampaignName || null
        ]
      );
    };

    for (const rule of normalized.meta.attributionRules) {
      await insertRule('meta', rule);
    }

    for (const rule of normalized.google.attributionRules) {
      await insertRule('google', rule);
    }

    await client.query(
      `insert into config_meta (id, version, updated_at)
       values (1, $1, now())
       on conflict (id)
       do update set version = excluded.version, updated_at = excluded.updated_at`,
      [Number(normalized.version || 1)]
    );
  });
}

function findClientName(clientId, clients) {
  const c = clients.find((x) => x.id === clientId);
  return c?.name || clientId;
}

function findCampaignName(campaignId, campaigns) {
  const c = campaigns.find((x) => x.id === campaignId);
  return c?.name || campaignId || null;
}

function matchesRule(rule, text) {
  if (!rule || rule.active === false) return false;
  const value = String(rule.matchValue || '');
  if (!value) return false;

  const t = normalizeText(text);
  const v = normalizeText(value);

  if (rule.matchType === 'equals') return t === v;
  if (rule.matchType === 'regex') {
    try {
      return new RegExp(value, 'i').test(text || '');
    } catch {
      return false;
    }
  }
  return t.includes(v);
}

function getInternalCampaignNameForChannel(campaign, channel) {
  const ch = normalizeText(channel);
  const ruleList = ch === 'google'
    ? (campaign?.attribution?.googleRules || [])
    : ch === 'meta'
      ? (campaign?.attribution?.metaRules || [])
      : [];
  const activeRule = ruleList.find((r) => r?.active !== false && String(r?.internalCampaignName || '').trim());
  if (activeRule?.internalCampaignName) return String(activeRule.internalCampaignName);

  const leadMap = (campaign?.sidial?.leadMappings || [])
    .find((m) => m?.active !== false && normalizeText(m?.source) === ch && String(m?.internalCampaignName || '').trim());
  if (leadMap?.internalCampaignName) return String(leadMap.internalCampaignName);

  const orderMap = (campaign?.sidial?.orderListMappings || [])
    .find((m) => m?.active !== false && normalizeText(m?.source) === ch && String(m?.internalCampaignName || '').trim());
  if (orderMap?.internalCampaignName) return String(orderMap.internalCampaignName);

  return null;
}

function fallbackAttributionByNames(channel, campaignName, config) {
  const text = normalizeText(campaignName);
  if (!text) return null;

  const clientsById = new Map((config.clients || []).map((c) => [String(c.id), c]));
  const activeCampaigns = (config.campaigns || []).filter((c) => c?.active !== false);
  const scored = [];

  for (const c of activeCampaigns) {
    const client = clientsById.get(String(c.clientId || ''));
    const campaignNorm = normalizeText(c.name);
    const clientNorm = normalizeText(client?.name || c.clientId);
    let score = 0;

    if (campaignNorm && text.includes(campaignNorm)) score += 12;
    if (clientNorm && text.includes(clientNorm)) score += 6;

    const channelRules = normalizeText(channel) === 'google'
      ? (c.attribution?.googleRules || [])
      : normalizeText(channel) === 'meta'
        ? (c.attribution?.metaRules || [])
        : [];
    for (const rule of channelRules) {
      if (rule?.active === false) continue;
      const mv = normalizeText(rule?.matchValue);
      if (mv && text.includes(mv)) score += 20;
    }

    if (score > 0) scored.push({ campaign: c, client, score });
  }

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best) return null;

  return {
    clientId: best.campaign.clientId || null,
    brand: best.campaign.clientId || null,
    campaignId: best.campaign.id || null,
    crmCampaignName: best.campaign.name || null,
    internalCampaignName: getInternalCampaignNameForChannel(best.campaign, channel),
    matchedRuleId: null
  };
}

async function getConfigAsync() {
  if (cache) return cache;

  if (dbEnabled()) {
    cache = await loadConfigFromDb();
    return cache;
  }

  cache = loadConfigFromFile();
  return cache;
}

export async function getCampaignConfig() {
  const cfg = await getConfigAsync();
  return clone(cfg);
}

export async function saveCampaignConfig(nextConfig) {
  const normalized = normalizeConfig(nextConfig);
  if (!Array.isArray(normalized.clients) || normalized.clients.length === 0) {
    throw Object.assign(new Error('Config non valida: clients non puo essere vuoto'), { status: 400, code: 'INVALID_CONFIG' });
  }

  if (dbEnabled()) {
    await saveConfigToDb(normalized);
  } else {
    ensureConfigFile();
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(normalized, null, 2), 'utf8');
  }

  cache = normalized;
  return clone(normalized);
}

export async function getSidialPairsBySource(source) {
  const config = await getConfigAsync();
  const src = normalizeText(source);

  return config.sidial.leadMappings
    .filter((m) => m.active !== false && normalizeText(m.source) === src)
    .map((m) => ({
      campaign: String(m.sidialCampaignId),
      list: String(m.sidialListId),
      source: src,
      clientId: m.clientId,
      campaignId: m.campaignId || null,
      campaignName: findClientName(m.clientId, config.clients),
      crmCampaignName: findCampaignName(m.campaignId, config.campaigns),
      listName: m.listLabel || m.internalCampaignName || `${findClientName(m.clientId, config.clients)} ${src}`,
      brand: m.clientId,
      channel: src,
      internalCampaignName: m.internalCampaignName || null
    }));
}

export async function deriveSidialOrderAttribution(listName) {
  const config = await getConfigAsync();
  const listText = normalizeText(listName);
  const mappingExact = config.sidial.orderListMappings.find(
    (m) => m.active !== false && normalizeText(m.sidialListName) === listText
  );
  const mappingFuzzy = !mappingExact
    ? config.sidial.orderListMappings
      .filter((m) => m.active !== false)
      .sort((a, b) => normalizeText(b.sidialListName).length - normalizeText(a.sidialListName).length)
      .find((m) => {
        const mapped = normalizeText(m.sidialListName);
        if (!mapped || !listText) return false;
        return listText.includes(mapped) || mapped.includes(listText);
      })
    : null;
  const mapping = mappingExact || mappingFuzzy;
  if (!mapping) return { source: null, brand: null, clientId: null, campaignId: null, internalCampaignName: null };
  return {
    source: normalizeText(mapping.source),
    brand: mapping.clientId || null,
    clientId: mapping.clientId || null,
    campaignId: mapping.campaignId || null,
    internalCampaignName: mapping.internalCampaignName || null
  };
}

export async function matchCampaignAttribution(channel, campaignName) {
  const config = await getConfigAsync();
  const ch = normalizeText(channel);
  const rules = ch === 'google' ? config.google.attributionRules : ch === 'meta' ? config.meta.attributionRules : [];

  const rule = rules.find((r) => matchesRule(r, campaignName));
  if (!rule) {
    const fallback = fallbackAttributionByNames(ch, campaignName, config);
    if (fallback) return fallback;

    return {
      clientId: null,
      brand: null,
      campaignId: null,
      crmCampaignName: null,
      internalCampaignName: null,
      matchedRuleId: null
    };
  }

  return {
    clientId: rule.clientId || null,
    brand: rule.clientId || null,
    campaignId: rule.campaignId || null,
    crmCampaignName: findCampaignName(rule.campaignId, config.campaigns),
    internalCampaignName: rule.internalCampaignName || null,
    matchedRuleId: rule.id || null
  };
}

export async function getClientCampaignTree() {
  const config = await getConfigAsync();
  return config.clients.map((client) => ({
    ...client,
    campaigns: config.campaigns.filter((c) => c.clientId === client.id)
  }));
}

export function resetCampaignConfigCache() {
  cache = null;
}

export function getDefaultCampaignConfig() {
  return clone(DEFAULT_CONFIG);
}
