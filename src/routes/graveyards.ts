import { Router } from 'express';
import { listGraveyards, getGraveyardById, listPlots, listDeceased } from '../supabase';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    return res.json(await listGraveyards());
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Failed to fetch graveyards' });
  }
});

// Must be before /:id to prevent 'deceased' being matched as an id param
router.get('/deceased/search', async (req, res) => {
  try {
    const q = (req.query.q as string) || '';
    return res.json(await listDeceased(q));
  } catch (e: any) {
    return res.status(500).json({ error: e?.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const g = await getGraveyardById(req.params.id);
    if (!g) return res.status(404).json({ error: 'Not found' });
    return res.json(g);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message });
  }
});

router.get('/:id/plots', async (req, res) => {
  try {
    return res.json(await listPlots(req.params.id));
  } catch (e: any) {
    return res.status(500).json({ error: e?.message });
  }
});

export default router;
