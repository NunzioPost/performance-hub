import { Router } from 'express';
import { getCampaignConfig, saveCampaignConfig, getClientCampaignTree } from '../services/campaignConfigService.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// GET /api/config/campaigns
router.get('/campaigns', async (req, res, next) => {
  try {
    const config = await getCampaignConfig();
    res.json({ success: true, data: config });
  } catch (e) {
    next(e);
  }
});

// GET /api/config/campaign-tree
router.get('/campaign-tree', async (req, res, next) => {
  try {
    const tree = await getClientCampaignTree();
    res.json({ success: true, data: tree });
  } catch (e) {
    next(e);
  }
});

// PUT /api/config/campaigns
router.put('/campaigns', requireRole('admin'), async (req, res, next) => {
  try {
    const nextConfig = req.body;
    if (!nextConfig || typeof nextConfig !== 'object') {
      return res.status(400).json({ error: true, message: 'Payload config non valido' });
    }

    const saved = await saveCampaignConfig(nextConfig);
    res.json({ success: true, data: saved });
  } catch (e) {
    next(e);
  }
});

export default router;
