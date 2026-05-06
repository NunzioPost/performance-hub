import { Router } from 'express';
import {
  createUser,
  listUsers,
  loginWithPassword,
  logoutByToken,
  updateUser
} from '../services/authService.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

router.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim();
    const password = String(req.body?.password || '');
    if (!email || !password) {
      return res.status(400).json({ error: true, message: 'email e password sono obbligatori' });
    }

    const session = await loginWithPassword({
      email,
      password,
      ip: req.ip || null,
      userAgent: req.headers['user-agent'] || null
    });

    return res.json({
      success: true,
      token: session.token,
      expiresAt: session.expiresAt,
      user: session.user
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    await logoutByToken(req.auth?.token);
    return res.json({ success: true });
  } catch (err) {
    return next(err);
  }
});

router.get('/me', requireAuth, async (req, res) => {
  res.json({ success: true, user: req.auth.user });
});

router.get('/users', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const users = await listUsers();
    return res.json({ success: true, data: users });
  } catch (err) {
    return next(err);
  }
});

router.post('/users', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const user = await createUser(req.body || {});
    return res.status(201).json({ success: true, data: user });
  } catch (err) {
    return next(err);
  }
});

router.patch('/users/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const user = await updateUser(req.params.id, req.body || {});
    return res.json({ success: true, data: user });
  } catch (err) {
    return next(err);
  }
});

export default router;
