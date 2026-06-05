import { Router } from 'express';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import { id } from '../utils/id';
import { getJwtSecret } from '../middleware/auth';
import {
  listGraveyards, getGraveyardById, createGraveyard, updateGraveyard, deleteGraveyard,
  listPlots, getPlotById, createPlot, updatePlot, deletePlot, countAvailablePlots,
  listProviders, getProviderById, createProvider, updateProvider, deleteProvider,
  getBookings, getBookingById, updateBooking, deleteBooking,
  countTodayBookings, countPendingBookings, revenueThisMonth,
  listDeceased, getDeceasedById, createDeceased, updateDeceased, deleteDeceased,
  listUsers, getUserTokens, saveNotification, uploadProviderImage,
  listSupportQueries, resolveSupportQuery,
} from '../supabase';

const providerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Images only'));
  },
});

const router = Router();

function requireAdmin(req: any, res: any, next: any) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(h.slice(7), getJwtSecret()) as any;
    if (payload.role !== 'admin') return res.status(403).json({ error: 'Admin access only' });
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ─── Dashboard stats ─────────────────────────────────────────────────────────
router.get('/stats', requireAdmin, async (_req, res) => {
  try {
    const [bookingsToday, pendingApprovals, availablePlots, revenue] = await Promise.all([
      countTodayBookings(),
      countPendingBookings(),
      countAvailablePlots(),
      revenueThisMonth(),
    ]);
    return res.json({ bookingsToday, pendingApprovals, availablePlots, revenue });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Failed to fetch stats' });
  }
});

// ─── Graveyards ───────────────────────────────────────────────────────────────
router.get('/graveyards', requireAdmin, async (_req, res) => {
  try { return res.json(await listGraveyards()); }
  catch (e: any) { return res.status(500).json({ error: e?.message }); }
});

router.get('/graveyards/:id', requireAdmin, async (req, res) => {
  try {
    const g = await getGraveyardById(req.params.id);
    if (!g) return res.status(404).json({ error: 'Not found' });
    return res.json(g);
  } catch (e: any) { return res.status(500).json({ error: e?.message }); }
});

router.post('/graveyards', requireAdmin, async (req, res) => {
  try { return res.status(201).json(await createGraveyard({ id: id(), ...req.body })); }
  catch (e: any) { return res.status(500).json({ error: e?.message }); }
});

router.put('/graveyards/:id', requireAdmin, async (req, res) => {
  try { return res.json(await updateGraveyard(req.params.id, req.body)); }
  catch (e: any) { return res.status(500).json({ error: e?.message }); }
});

router.delete('/graveyards/:id', requireAdmin, async (req, res) => {
  try { await deleteGraveyard(req.params.id); return res.json({ ok: true }); }
  catch (e: any) { return res.status(500).json({ error: e?.message }); }
});

// ─── Plots ────────────────────────────────────────────────────────────────────
router.get('/plots', requireAdmin, async (req, res) => {
  try { return res.json(await listPlots(req.query.graveyard_id as string | undefined)); }
  catch (e: any) { return res.status(500).json({ error: e?.message }); }
});

router.get('/plots/:id', requireAdmin, async (req, res) => {
  try {
    const p = await getPlotById(req.params.id);
    if (!p) return res.status(404).json({ error: 'Not found' });
    return res.json(p);
  } catch (e: any) { return res.status(500).json({ error: e?.message }); }
});

router.post('/plots', requireAdmin, async (req, res) => {
  try { return res.status(201).json(await createPlot({ id: id(), ...req.body })); }
  catch (e: any) { return res.status(500).json({ error: e?.message }); }
});

router.put('/plots/:id', requireAdmin, async (req, res) => {
  try { return res.json(await updatePlot(req.params.id, req.body)); }
  catch (e: any) { return res.status(500).json({ error: e?.message }); }
});

router.delete('/plots/:id', requireAdmin, async (req, res) => {
  try { await deletePlot(req.params.id); return res.json({ ok: true }); }
  catch (e: any) { return res.status(500).json({ error: e?.message }); }
});

// ─── Service Providers ────────────────────────────────────────────────────────
router.get('/providers', requireAdmin, async (req, res) => {
  try { return res.json(await listProviders(req.query.type as string | undefined)); }
  catch (e: any) { return res.status(500).json({ error: e?.message }); }
});

router.get('/providers/:id', requireAdmin, async (req, res) => {
  try {
    const p = await getProviderById(req.params.id);
    if (!p) return res.status(404).json({ error: 'Not found' });
    return res.json(p);
  } catch (e: any) { return res.status(500).json({ error: e?.message }); }
});

router.post('/providers', requireAdmin, async (req, res) => {
  try { return res.status(201).json(await createProvider({ id: id(), ...req.body })); }
  catch (e: any) { return res.status(500).json({ error: e?.message }); }
});

router.put('/providers/:id', requireAdmin, async (req, res) => {
  try { return res.json(await updateProvider(req.params.id, req.body)); }
  catch (e: any) { return res.status(500).json({ error: e?.message }); }
});

router.delete('/providers/:id', requireAdmin, async (req, res) => {
  try { await deleteProvider(req.params.id); return res.json({ ok: true }); }
  catch (e: any) { return res.status(500).json({ error: e?.message }); }
});

router.post('/providers/:id/image', requireAdmin, providerUpload.single('image'), async (req: any, res: any) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const ext = path.extname(req.file.originalname) || '.jpg';
  try {
    const imageUrl = await uploadProviderImage(req.params.id, req.file.buffer, req.file.mimetype, ext);
    await updateProvider(req.params.id, { image_url: imageUrl });
    return res.json({ imageUrl });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Failed to upload image' });
  }
});

// ─── Bookings ─────────────────────────────────────────────────────────────────
router.get('/bookings', requireAdmin, async (_req, res) => {
  try { return res.json(await getBookings()); }
  catch (e: any) { return res.status(500).json({ error: e?.message }); }
});

router.get('/bookings/:id', requireAdmin, async (req, res) => {
  try {
    const b = await getBookingById(req.params.id);
    if (!b) return res.status(404).json({ error: 'Not found' });
    return res.json(b);
  } catch (e: any) { return res.status(500).json({ error: e?.message }); }
});

router.put('/bookings/:id', requireAdmin, async (req, res) => {
  try {
    const existing = await getBookingById(req.params.id);

    // 'completed' is not in the Supabase bookings_status_check constraint.
    // Work around it: keep status='confirmed' but stamp meta.completed_at so
    // the UI can distinguish "confirmed-and-completed" from just "confirmed".
    let patch = { ...req.body };
    if (patch.status === 'completed') {
      patch.status = 'confirmed';
      patch.meta = { ...(existing?.meta || {}), completed_at: new Date().toISOString() };
    }

    const updated = await updateBooking(req.params.id, patch);
    const newStatus: string | undefined = req.body.status; // use original intent for notifications/plot

    // Update the plot status based on the new booking status
    if (newStatus && existing?.meta?.plotId) {
      const plotStatus =
        newStatus === 'completed'  ? 'occupied'  :
        newStatus === 'cancelled'  ? 'available' :
        /* pending/paid/confirmed */ 'reserved';
      try { await updatePlot(existing.meta.plotId, { status: plotStatus }); } catch { /* non-critical */ }
    }

    if (newStatus && existing && newStatus !== existing.status) {
      const userId: string = existing.user_id;
      const MESSAGES: Record<string, { title: string; body: string; type: string }> = {
        confirmed: { title: 'Booking confirmed', body: 'Your booking has been approved and confirmed.', type: 'booking_confirmed' },
        completed: { title: 'Service completed', body: 'Your booking has been marked as completed.', type: 'booking_completed' },
        cancelled: { title: 'Booking cancelled', body: 'Your booking has been cancelled by the administrator.', type: 'booking_cancelled' },
        pending:   { title: 'Booking pending', body: 'Your booking is now pending review.', type: 'booking_pending' },
      };
      const msg = MESSAGES[newStatus];
      if (msg) {
        try { await saveNotification(userId, msg.title, msg.body, msg.type, req.params.id); } catch { /* non-critical */ }
        try {
          const tokens = await getUserTokens(userId);
          if (tokens?.length) await import('../notifications').then((m) => m.sendMany(tokens, msg.title, msg.body));
        } catch { /* non-critical */ }
      }
    }
    return res.json(updated);
  } catch (e: any) { return res.status(500).json({ error: e?.message }); }
});

router.delete('/bookings/:id', requireAdmin, async (req, res) => {
  try { await deleteBooking(req.params.id); return res.json({ ok: true }); }
  catch (e: any) { return res.status(500).json({ error: e?.message }); }
});

// ─── Deceased Records ─────────────────────────────────────────────────────────
router.get('/deceased', requireAdmin, async (req, res) => {
  try { return res.json(await listDeceased(req.query.search as string | undefined)); }
  catch (e: any) { return res.status(500).json({ error: e?.message }); }
});

router.get('/deceased/:id', requireAdmin, async (req, res) => {
  try {
    const d = await getDeceasedById(req.params.id);
    if (!d) return res.status(404).json({ error: 'Not found' });
    return res.json(d);
  } catch (e: any) { return res.status(500).json({ error: e?.message }); }
});

router.post('/deceased', requireAdmin, async (req, res) => {
  try { return res.status(201).json(await createDeceased({ id: id(), ...req.body })); }
  catch (e: any) { return res.status(500).json({ error: e?.message }); }
});

router.put('/deceased/:id', requireAdmin, async (req, res) => {
  try { return res.json(await updateDeceased(req.params.id, req.body)); }
  catch (e: any) { return res.status(500).json({ error: e?.message }); }
});

router.delete('/deceased/:id', requireAdmin, async (req, res) => {
  try { await deleteDeceased(req.params.id); return res.json({ ok: true }); }
  catch (e: any) { return res.status(500).json({ error: e?.message }); }
});

// ─── Users (read-only for admin) ──────────────────────────────────────────────
router.get('/users', requireAdmin, async (_req, res) => {
  try { return res.json(await listUsers()); }
  catch (e: any) { return res.status(500).json({ error: e?.message }); }
});

// ─── Support Queries ──────────────────────────────────────────────────────────
router.get('/support', requireAdmin, async (_req, res) => {
  try { return res.json(await listSupportQueries()); }
  catch (e: any) { return res.status(500).json({ error: e?.message }); }
});

router.patch('/support/:id', requireAdmin, async (req, res) => {
  try { return res.json(await resolveSupportQuery(req.params.id)); }
  catch (e: any) { return res.status(500).json({ error: e?.message }); }
});

export default router;
