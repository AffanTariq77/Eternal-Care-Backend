import { Router } from 'express';
import { createSupportQuery } from '../supabase';

const router = Router();

// POST /support — public, no auth required
router.post('/', async (req, res) => {
  const { name, email, message } = req.body as any;
  if (!name?.trim() || !email?.trim() || !message?.trim()) {
    return res.status(400).json({ error: 'name, email, and message are required' });
  }
  try {
    const row = await createSupportQuery({ name: name.trim(), email: email.trim(), message: message.trim() });
    return res.json({ ok: true, id: row?.id });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Failed to save query' });
  }
});

export default router;
