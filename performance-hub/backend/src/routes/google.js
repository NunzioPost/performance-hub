import { Router } from 'express';
import { getInsights } from '../services/googleService.js';

const router = Router();

// GET /api/google/insights?dateFrom=2024-01-01 00:00:00&dateTo=2024-01-31 23:59:59
router.get('/insights', async (req, res, next) => {
  try {
    const { dateFrom, dateTo } = req.query;
    if (!dateFrom || !dateTo) return res.status(400).json({ error: true, message: 'dateFrom e dateTo obbligatori' });

    const from = dateFrom.split(' ')[0];
    const to = dateTo.split(' ')[0];

    const data = await getInsights(from, to);
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

export default router;
