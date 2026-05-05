import { Pool } from 'pg';

let pool = null;

function isDbEnabled() {
  const storage = String(process.env.CONFIG_STORAGE || '').toLowerCase().trim();
  return storage === 'db' || storage === 'database';
}

function getPool() {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw Object.assign(new Error('DATABASE_URL non configurato'), { status: 503, code: 'DB_NOT_CONFIGURED' });
  }

  const sslMode = String(process.env.DATABASE_SSL || 'disable').toLowerCase();
  const ssl = sslMode === 'require' ? { rejectUnauthorized: false } : false;

  pool = new Pool({ connectionString, ssl, max: 10 });
  return pool;
}

export function dbEnabled() {
  return isDbEnabled();
}

export async function dbQuery(text, params = []) {
  const p = getPool();
  return p.query(text, params);
}

export async function withDbTransaction(fn) {
  const p = getPool();
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function dbHealthcheck() {
  const p = getPool();
  const res = await p.query('select now() as now');
  return res.rows?.[0]?.now || null;
}
