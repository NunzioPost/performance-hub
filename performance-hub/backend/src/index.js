import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import express from 'express';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import sidialRoutes from './routes/sidial.js';
import metaRoutes from './routes/meta.js';
import googleRoutes from './routes/google.js';
import configRoutes from './routes/config.js';
import { errorHandler } from './middleware/errorHandler.js';
import { autoEnrichOrders, warmSidialCache } from './services/sidialService.js';
import { warmMetaInsights } from './services/metaService.js';
import { warmGoogleInsights } from './services/googleService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();
const PORT = process.env.PORT || 3001;
const AUTO_ENRICH_ENABLED = String(process.env.AUTO_ENRICH_ENABLED || 'true').toLowerCase() !== 'false';
const AUTO_ENRICH_INTERVAL_MINUTES = Number(process.env.AUTO_ENRICH_INTERVAL_MINUTES || 18);
const AUTO_ENRICH_DAYS_BACK = Number(process.env.AUTO_ENRICH_DAYS_BACK || 3);
const AUTO_ENRICH_MAX_ORDERS = Number(process.env.AUTO_ENRICH_MAX_ORDERS || 200);
const AUTO_ENRICH_START_DELAY_SECONDS = Number(process.env.AUTO_ENRICH_START_DELAY_SECONDS || 45);
const SIDIAL_WARMUP_ENABLED = String(process.env.SIDIAL_WARMUP_ENABLED || 'true').toLowerCase() !== 'false';
const SIDIAL_WARMUP_INTERVAL_MINUTES = Number(process.env.SIDIAL_WARMUP_INTERVAL_MINUTES || 18);
const SIDIAL_WARMUP_START_DELAY_SECONDS = Number(process.env.SIDIAL_WARMUP_START_DELAY_SECONDS || 75);
const MARKETING_WARMUP_ENABLED = String(process.env.MARKETING_WARMUP_ENABLED || 'true').toLowerCase() !== 'false';
const MARKETING_WARMUP_INTERVAL_MINUTES = Number(process.env.MARKETING_WARMUP_INTERVAL_MINUTES || 15);
const MARKETING_WARMUP_START_DELAY_SECONDS = Number(process.env.MARKETING_WARMUP_START_DELAY_SECONDS || 90);
const RATE_LIMIT_ENABLED = String(process.env.RATE_LIMIT_ENABLED || 'true').toLowerCase() !== 'false';
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || (15 * 60 * 1000));
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 300);
const RATE_LIMIT_SKIP_LOCAL = String(process.env.RATE_LIMIT_SKIP_LOCAL || 'true').toLowerCase() !== 'false';

app.use(cors({
  origin: [
    'http://localhost:5173',
    process.env.FRONTEND_URL
  ].filter(Boolean)
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function isLocalIp(ip = '') {
  const x = String(ip || '').toLowerCase();
  return x === '::1' || x === '127.0.0.1' || x === '::ffff:127.0.0.1' || x.startsWith('::ffff:192.168.');
}

if (RATE_LIMIT_ENABLED) {
  app.use(rateLimit({
    windowMs: Math.max(1000, RATE_LIMIT_WINDOW_MS),
    max: Math.max(1, RATE_LIMIT_MAX),
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => RATE_LIMIT_SKIP_LOCAL && isLocalIp(req.ip),
    message: {
      error: true,
      code: 'RATE_LIMIT',
      message: 'Troppe richieste in poco tempo. Riprova tra qualche secondo.'
    }
  }));
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Performance Hub API',
    endpoints: ['/api/health', '/api/sidial/*', '/api/meta/*', '/api/google/*']
  });
});

// OAuth Google - route temporanea per ottenere il refresh token
// Usala una volta sola durante il setup, poi puoi ignorarla
app.get('/oauth/google/start', (req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: `http://localhost:${PORT}/oauth/callback`,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/adwords',
    access_type: 'offline',
    prompt: 'consent'
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

app.get('/oauth/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Codice mancante');
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `http://localhost:${PORT}/oauth/callback`,
        grant_type: 'authorization_code'
      })
    });
    const data = await response.json();
    res.send(`
      <h2>Refresh Token ottenuto!</h2>
      <p>Copia questo valore nel tuo .env come <strong>GOOGLE_REFRESH_TOKEN</strong>:</p>
      <pre style="background:#f0f0f0;padding:12px;border-radius:6px;word-break:break-all">
        ${data.refresh_token || 'ERRORE: ' + JSON.stringify(data)}
      </pre>
    `);
  } catch (e) {
    res.status(500).send('Errore: ' + e.message);
  }
});

app.use('/api/sidial', sidialRoutes);
app.use('/api/meta', metaRoutes);
app.use('/api/google', googleRoutes);
app.use('/api/config', configRoutes);

app.use(errorHandler);

function startAutoEnrichJob() {
  if (!AUTO_ENRICH_ENABLED) {
    console.log('[AUTO-ENRICH] disabilitato (AUTO_ENRICH_ENABLED=false)');
    return;
  }

  const intervalMs = Math.max(1, AUTO_ENRICH_INTERVAL_MINUTES) * 60 * 1000;
  const startDelayMs = Math.max(0, AUTO_ENRICH_START_DELAY_SECONDS) * 1000;
  let running = false;

  const run = async (trigger) => {
    if (running) {
      console.log(`[AUTO-ENRICH] skip (${trigger}): job precedente ancora in corso`);
      return;
    }
    running = true;
    const startedAt = Date.now();
    try {
      const res = await autoEnrichOrders({
        daysBack: AUTO_ENRICH_DAYS_BACK,
        maxOrders: AUTO_ENRICH_MAX_ORDERS,
        logger: console
      });
      const elapsed = Date.now() - startedAt;
      console.log(
        `[AUTO-ENRICH] ${trigger} ok in ${elapsed}ms | scanned=${res.scanned} pending=${res.pending} enriched=${res.enriched} failed=${res.failed}`
      );
    } catch (err) {
      console.error(`[AUTO-ENRICH] ${trigger} errore: ${err.message}`);
    } finally {
      running = false;
    }
  };

  console.log(
    `[AUTO-ENRICH] attivo ogni ${AUTO_ENRICH_INTERVAL_MINUTES} minuti (daysBack=${AUTO_ENRICH_DAYS_BACK}, maxOrders=${AUTO_ENRICH_MAX_ORDERS})`
  );
  setTimeout(() => { run('startup'); }, startDelayMs);
  setInterval(() => { run('interval'); }, intervalMs);
}

function startSidialWarmupJob() {
  if (!SIDIAL_WARMUP_ENABLED) {
    console.log('[SIDIAL-WARMUP] disabilitato (SIDIAL_WARMUP_ENABLED=false)');
    return;
  }

  const intervalMs = Math.max(1, SIDIAL_WARMUP_INTERVAL_MINUTES) * 60 * 1000;
  const startDelayMs = Math.max(0, SIDIAL_WARMUP_START_DELAY_SECONDS) * 1000;
  let running = false;

  const run = async (trigger) => {
    if (running) {
      console.log(`[SIDIAL-WARMUP] skip (${trigger}): job precedente ancora in corso`);
      return;
    }
    running = true;
    const startedAt = Date.now();
    try {
      const res = await warmSidialCache({ logger: console });
      const elapsed = Date.now() - startedAt;
      console.log(
        `[SIDIAL-WARMUP] ${trigger} ok in ${elapsed}ms | leads.google=${res.leads.google} leads.meta=${res.leads.meta} orders=${res.orders}`
      );
    } catch (err) {
      console.error(`[SIDIAL-WARMUP] ${trigger} errore: ${err.message}`);
    } finally {
      running = false;
    }
  };

  console.log(`[SIDIAL-WARMUP] attivo ogni ${SIDIAL_WARMUP_INTERVAL_MINUTES} minuti`);
  setTimeout(() => { run('startup'); }, startDelayMs);
  setInterval(() => { run('interval'); }, intervalMs);
}

function formatDate(date, isEnd = false) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}${isEnd ? ' 23:59:59' : ' 00:00:00'}`;
}

function startMarketingWarmupJob() {
  if (!MARKETING_WARMUP_ENABLED) {
    console.log('[MKT-WARMUP] disabilitato (MARKETING_WARMUP_ENABLED=false)');
    return;
  }

  const intervalMs = Math.max(1, MARKETING_WARMUP_INTERVAL_MINUTES) * 60 * 1000;
  const startDelayMs = Math.max(0, MARKETING_WARMUP_START_DELAY_SECONDS) * 1000;
  let running = false;

  const run = async (trigger) => {
    if (running) {
      console.log(`[MKT-WARMUP] skip (${trigger}): job precedente ancora in corso`);
      return;
    }
    running = true;
    const startedAt = Date.now();
    const now = new Date();
    const dateFrom = formatDate(now, false).split(' ')[0];
    const dateTo = formatDate(now, true).split(' ')[0];

    try {
      const [meta, google] = await Promise.allSettled([
        warmMetaInsights({ dateFrom, dateTo }),
        warmGoogleInsights({ dateFrom, dateTo })
      ]);
      const elapsed = Date.now() - startedAt;
      const metaStatus = meta.status === 'fulfilled' ? 'ok' : `err:${meta.reason?.message || 'unknown'}`;
      const googleStatus = google.status === 'fulfilled' ? 'ok' : `err:${google.reason?.message || 'unknown'}`;
      console.log(`[MKT-WARMUP] ${trigger} in ${elapsed}ms | meta=${metaStatus} google=${googleStatus}`);
    } catch (err) {
      console.error(`[MKT-WARMUP] ${trigger} errore: ${err.message}`);
    } finally {
      running = false;
    }
  };

  console.log(`[MKT-WARMUP] attivo ogni ${MARKETING_WARMUP_INTERVAL_MINUTES} minuti`);
  setTimeout(() => { run('startup'); }, startDelayMs);
  setInterval(() => { run('interval'); }, intervalMs);
}

app.listen(PORT, () => {
  console.log(`Performance Hub backend in ascolto su http://localhost:${PORT}`);
  startAutoEnrichJob();
  startSidialWarmupJob();
  startMarketingWarmupJob();
});
