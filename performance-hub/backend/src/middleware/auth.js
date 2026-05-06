import { getSessionByToken } from '../services/authService.js';

function readBearerToken(req) {
  const raw = String(req.headers?.authorization || '').trim();
  if (!raw.toLowerCase().startsWith('bearer ')) return null;
  return raw.slice(7).trim() || null;
}

export async function requireAuth(req, res, next) {
  try {
    const token = readBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: true, code: 'AUTH_MISSING', message: 'Autenticazione richiesta' });
    }
    const session = await getSessionByToken(token);
    if (!session) {
      return res.status(401).json({ error: true, code: 'AUTH_INVALID', message: 'Sessione non valida o scaduta' });
    }
    req.auth = {
      token,
      sessionId: session.sessionId,
      userId: session.userId,
      user: session.user
    };
    return next();
  } catch (err) {
    return next(err);
  }
}

export function requireRole(...roles) {
  const normalized = roles.map((r) => String(r || '').toLowerCase()).filter(Boolean);
  return (req, res, next) => {
    const current = String(req?.auth?.user?.role || '').toLowerCase();
    if (!current || !normalized.includes(current)) {
      return res.status(403).json({ error: true, code: 'AUTH_FORBIDDEN', message: 'Permessi insufficienti' });
    }
    return next();
  };
}
