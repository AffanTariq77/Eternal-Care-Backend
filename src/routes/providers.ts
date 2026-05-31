import { Router } from 'express';
import { listProviders } from '../supabase';

const router = Router();

// Public endpoint: GET /service-providers?type=quran_recitation
router.get('/', async (req, res) => {
  try {
    const type = req.query.type as string | undefined;
    const providers = await listProviders(type);
    return res.json(providers);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Failed to fetch providers' });
  }
});

export default router;
