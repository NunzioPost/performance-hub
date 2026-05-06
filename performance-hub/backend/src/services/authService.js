import crypto from 'crypto';
import { dbQuery } from '../lib/db.js';

const SESSION_HOURS = Math.max(1, Number(process.env.AUTH_SESSION_HOURS || 24));
const ADMIN_EMAIL = String(process.env.AUTH_BOOTSTRAP_ADMIN_EMAIL || 'admin@performance-hub.local').trim().toLowerCase();
const ADMIN_PASSWORD = String(process.env.AUTH_BOOTSTRAP_ADMIN_PASSWORD || 'ChangeMeNow!123').trim();
const ADMIN_NAME = String(process.env.AUTH_BOOTSTRAP_ADMIN_NAME || 'Admin').trim();

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeRole(role) {
  const value = String(role || '').trim().toLowerCase();
  return value === 'admin' ? 'admin' : 'user';
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const value = String(password || '');
  const derived = crypto.scryptSync(value, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function verifyPassword(password, passwordHash) {
  const raw = String(passwordHash || '');
  const parts = raw.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, stored] = parts;
  const check = crypto.scryptSync(String(password || ''), salt, 64).toString('hex');
  const a = Buffer.from(stored, 'hex');
  const b = Buffer.from(check, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function toPublicUser(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    email: row.email,
    name: row.name,
    role: row.role,
    active: row.active !== false,
    lastLoginAt: row.last_login_at || null,
    createdAt: row.created_at || null
  };
}

async function findUserByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const res = await dbQuery(
    `select id, email, password_hash, name, role, active, last_login_at, created_at
       from auth_users
      where lower(email) = $1
      limit 1`,
    [normalized]
  );
  return res.rows?.[0] || null;
}

async function findUserById(id) {
  const res = await dbQuery(
    `select id, email, name, role, active, last_login_at, created_at
       from auth_users
      where id = $1
      limit 1`,
    [Number(id)]
  );
  return res.rows?.[0] || null;
}

export async function ensureBootstrapAdmin() {
  const existing = await dbQuery('select id from auth_users limit 1');
  if ((existing.rows || []).length > 0) return;

  const passwordHash = hashPassword(ADMIN_PASSWORD);
  await dbQuery(
    `insert into auth_users (email, password_hash, name, role, active, created_at, updated_at)
     values ($1, $2, $3, 'admin', true, now(), now())`,
    [ADMIN_EMAIL, passwordHash, ADMIN_NAME]
  );
  console.warn(`[AUTH] bootstrap admin creato: ${ADMIN_EMAIL}`);
}

export async function loginWithPassword({ email, password, ip = null, userAgent = null }) {
  await ensureBootstrapAdmin();
  const user = await findUserByEmail(email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    throw Object.assign(new Error('Credenziali non valide'), { status: 401, code: 'AUTH_INVALID_CREDENTIALS' });
  }
  if (user.active === false) {
    throw Object.assign(new Error('Utente disattivato'), { status: 403, code: 'AUTH_USER_DISABLED' });
  }

  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + (SESSION_HOURS * 60 * 60 * 1000));

  const session = await dbQuery(
    `insert into auth_sessions (user_id, token_hash, ip, user_agent, expires_at, last_seen_at, created_at)
     values ($1, $2, $3, $4, $5, now(), now())
     returning id`,
    [user.id, tokenHash, ip, userAgent, expiresAt.toISOString()]
  );

  await dbQuery(
    `update auth_users
        set last_login_at = now(), updated_at = now()
      where id = $1`,
    [user.id]
  );

  return {
    token,
    expiresAt: expiresAt.toISOString(),
    sessionId: Number(session.rows?.[0]?.id || 0),
    user: toPublicUser(user)
  };
}

export async function getSessionByToken(token) {
  const normalized = String(token || '').trim();
  if (!normalized) return null;
  const tokenHash = hashToken(normalized);

  const res = await dbQuery(
    `select s.id as session_id, s.user_id, s.expires_at, s.revoked_at,
            u.id, u.email, u.name, u.role, u.active, u.last_login_at, u.created_at
       from auth_sessions s
       join auth_users u on u.id = s.user_id
      where s.token_hash = $1
      limit 1`,
    [tokenHash]
  );
  const row = res.rows?.[0];
  if (!row) return null;
  if (row.revoked_at) return null;
  if (row.active === false) return null;
  const expiresTs = new Date(row.expires_at).getTime();
  if (!Number.isFinite(expiresTs) || expiresTs < Date.now()) return null;

  await dbQuery(
    `update auth_sessions set last_seen_at = now() where id = $1`,
    [row.session_id]
  );

  return {
    sessionId: Number(row.session_id),
    userId: Number(row.user_id),
    expiresAt: row.expires_at,
    user: toPublicUser(row)
  };
}

export async function logoutByToken(token) {
  const normalized = String(token || '').trim();
  if (!normalized) return;
  const tokenHash = hashToken(normalized);
  await dbQuery(
    `update auth_sessions
        set revoked_at = now()
      where token_hash = $1
        and revoked_at is null`,
    [tokenHash]
  );
}

export async function listUsers() {
  const res = await dbQuery(
    `select id, email, name, role, active, last_login_at, created_at
       from auth_users
      order by created_at asc`
  );
  return (res.rows || []).map(toPublicUser);
}

export async function createUser({ email, password, name, role = 'user', active = true }) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedName = String(name || '').trim();
  const normalizedRole = normalizeRole(role);
  const rawPassword = String(password || '');

  if (!normalizedEmail || !normalizedName || rawPassword.length < 8) {
    throw Object.assign(
      new Error('Campi utente non validi (email, nome e password min 8 caratteri sono obbligatori)'),
      { status: 400, code: 'AUTH_USER_INVALID' }
    );
  }

  const existing = await findUserByEmail(normalizedEmail);
  if (existing) {
    throw Object.assign(new Error('Email utente già presente'), { status: 409, code: 'AUTH_USER_EXISTS' });
  }

  const passwordHash = hashPassword(rawPassword);
  const res = await dbQuery(
    `insert into auth_users (email, password_hash, name, role, active, created_at, updated_at)
     values ($1, $2, $3, $4, $5, now(), now())
     returning id`,
    [normalizedEmail, passwordHash, normalizedName, normalizedRole, !!active]
  );
  const created = await findUserById(res.rows?.[0]?.id);
  return toPublicUser(created);
}

export async function updateUser(userId, payload = {}) {
  const id = Number(userId);
  if (!Number.isFinite(id)) {
    throw Object.assign(new Error('ID utente non valido'), { status: 400, code: 'AUTH_USER_INVALID_ID' });
  }

  const current = await dbQuery(
    `select id, email, name, role, active from auth_users where id = $1 limit 1`,
    [id]
  );
  if ((current.rows || []).length === 0) {
    throw Object.assign(new Error('Utente non trovato'), { status: 404, code: 'AUTH_USER_NOT_FOUND' });
  }

  const nextName = payload.name !== undefined ? String(payload.name || '').trim() : current.rows[0].name;
  const nextRole = payload.role !== undefined ? normalizeRole(payload.role) : current.rows[0].role;
  const nextActive = payload.active !== undefined ? !!payload.active : current.rows[0].active;

  if (!nextName) {
    throw Object.assign(new Error('Nome utente non valido'), { status: 400, code: 'AUTH_USER_INVALID_NAME' });
  }

  await dbQuery(
    `update auth_users
        set name = $2, role = $3, active = $4, updated_at = now()
      where id = $1`,
    [id, nextName, nextRole, nextActive]
  );

  if (payload.password !== undefined) {
    const rawPassword = String(payload.password || '');
    if (rawPassword.length < 8) {
      throw Object.assign(new Error('Password troppo corta (min 8 caratteri)'), { status: 400, code: 'AUTH_USER_INVALID_PASSWORD' });
    }
    const passwordHash = hashPassword(rawPassword);
    await dbQuery(
      `update auth_users
          set password_hash = $2, updated_at = now()
        where id = $1`,
      [id, passwordHash]
    );
  }

  const updated = await findUserById(id);
  return toPublicUser(updated);
}
