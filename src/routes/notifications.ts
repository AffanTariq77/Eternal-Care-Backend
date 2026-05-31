import { Router } from 'express';
import { ensureAuth, AuthRequest } from '../middleware/auth';
import { listNotifications, markNotificationRead } from '../supabase';

const router = Router();

router.get('/', ensureAuth, async (req: AuthRequest, res) => {
  try {
    const notifs = await listNotifications(req.userId!);
    return res.json({ notifications: notifs });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Failed to fetch notifications' });
  }
});

router.post('/:id/read', ensureAuth, async (req: AuthRequest, res) => {
  try {
    await markNotificationRead(req.params.id, req.userId!);
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message });
  }
});

export default router;
