import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { Pool } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL mancante nel file .env');
  process.exit(1);
}

const sslMode = String(process.env.DATABASE_SSL || 'disable').toLowerCase();
const ssl = sslMode === 'require' ? { rejectUnauthorized: false } : false;

const pool = new Pool({ connectionString, ssl, max: 1 });

const migrationsDir = path.resolve(__dirname, '../db/migrations');

async function ensureMigrationsTable(client) {
  await client.query(`
    create table if not exists schema_migrations (
      id bigserial primary key,
      name text not null unique,
      applied_at timestamptz not null default now()
    )
  `);
}

function readMigrations() {
  const files = fs.readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));
  return files.map((name) => ({
    name,
    sql: fs.readFileSync(path.join(migrationsDir, name), 'utf8')
  }));
}

async function run() {
  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);

    const { rows } = await client.query('select name from schema_migrations');
    const applied = new Set(rows.map((r) => r.name));
    const migrations = readMigrations();

    for (const migration of migrations) {
      if (applied.has(migration.name)) {
        console.log(`skip ${migration.name}`);
        continue;
      }

      console.log(`apply ${migration.name}`);
      await client.query('begin');
      try {
        await client.query(migration.sql);
        await client.query('insert into schema_migrations (name) values ($1)', [migration.name]);
        await client.query('commit');
      } catch (err) {
        await client.query('rollback');
        throw err;
      }
    }

    console.log('migrations complete');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('migration error:', err.message);
  process.exit(1);
});
