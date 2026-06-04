import { Router } from 'express';
import { getSql, isDBConnected } from '../db';
import { readData, writeData } from '../store';
import { isSupabaseConfigured, createBooking, getBookings, getBookingById, createPayment, updateBooking, updatePlot, getUserTokens, saveNotification } from '../supabase';
import { shouldUseSupabase, isFileFallbackDisabled } from '../dbAdapter';
import { id } from '../utils/id';
import { ensureAuth, AuthRequest } from '../middleware/auth';
const router = Router();

async function notifyUser(userId: string, title: string, body: string, type: string, bookingId?: string) {
  try {
    await saveNotification(userId, title, body, type, bookingId);
  } catch { /* non-critical */ }
  try {
    const tokens = await getUserTokens(userId);
    if (tokens && tokens.length) {
      await import('../notifications').then((m) => m.sendMany(tokens, title, body));
    }
  } catch { /* non-critical */ }
}

// Create booking (authenticated)
router.post('/', ensureAuth, async (req: AuthRequest, res) => {
  const userId = req.userId;
  const { packageId, date, meta } = req.body as any;
  const missing: string[] = [];
  if (!userId) missing.push('user');
  if (!packageId) missing.push('packageId');
  if (!date) missing.push('date');
  if (missing.length) return res.status(400).json({ error: `Missing fields: ${missing.join(', ')}` });
  if (date && isNaN(Date.parse(date))) return res.status(400).json({ error: 'Invalid date format. Use ISO 8601.' });
  const bid = id();
  // prefer Supabase then Postgres then fallback
  if (await shouldUseSupabase()) {
    try {
      const row = await createBooking({ id: bid, user_id: userId, package_id: packageId, date, status: 'pending', meta });
      if (row) {
        // Mirror booking into file fallback for local dev so payment fallback can find it
        try {
          if (!isFileFallbackDisabled()) {
            const data = await readData();
            if (!data.bookings.find((b: any) => b.id === row.id)) {
              data.bookings.push({ id: row.id, userId: userId!, packageId: row.package_id!, date: row.date, status: row.status, meta: row.meta });
              await writeData(data);
            }
          }
        } catch {
          // non-critical mirror
        }
        notifyUser(userId!, 'Booking received', `Your booking has been received and is pending review.`, 'booking_pending', row.id);
        // Reserve the plot as soon as a booking is created (even before payment)
        if (meta?.plotId) {
          try { await updatePlot(meta.plotId, { status: 'reserved' }); } catch { /* non-critical */ }
        }
        return res.json({ booking: { id: row.id, userId: row.user_id, packageId: row.package_id, date: row.date, status: row.status, meta: row.meta } });
      }
      // if API returned null/empty, fall through to other adapters
    } catch {
      // fall through to Postgres or file fallback
    }
  }

  if (isDBConnected()) {
    const sql = getSql();
    await sql`INSERT INTO bookings (id, user_id, package_id, date, status, meta) VALUES (${bid}, ${userId!}, ${packageId}, ${date}, 'pending', ${meta})`;
    const rows = await sql`SELECT id, user_id, package_id, date, status, meta FROM bookings WHERE id = ${bid}`;
    notifyUser(userId!, 'Booking received', `Your booking has been received and is pending review.`, 'booking_pending', bid);
    return res.json({ booking: rows[0] });
  }

  if (isFileFallbackDisabled()) return res.status(500).json({ error: 'No DB available' });

  // fallback
  const data = await readData();
  const booking = { id: bid, userId, packageId, date, status: 'pending', meta } as any;
  data.bookings.push(booking);
  await writeData(data);
  notifyUser(userId!, 'Booking received', `Your booking has been received and is pending review.`, 'booking_pending', bid);
  return res.json({ booking });
});

// GET /bookings/me — returns bookings for the authenticated user
router.get('/me', ensureAuth, async (req: AuthRequest, res) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  if (await shouldUseSupabase()) {
    try {
      const rows = await getBookings(userId);
      const mapped = rows.map((r: any) => ({
        id: r.id,
        service: r.meta?.serviceType || r.meta?.service || 'Booking',
        detail: r.meta?.packageLabel || r.meta?.detail || r.package_id || '',
        date: (r.date || '').substring(0, 10),
        price: String(r.meta?.price || r.amount || 0),
        status: ['paid', 'confirmed', 'pending'].includes(r.status) ? 'upcoming' : (r.status || 'upcoming'),
        packageId: r.package_id,
        meta: r.meta || {},
        created_at: r.created_at,
      }));
      return res.json({ bookings: mapped });
    } catch { /* fall through */ }
  }

  if (isDBConnected()) {
    const sql = getSql();
    const rows = await sql`SELECT * FROM bookings WHERE user_id = ${userId} ORDER BY created_at DESC`;
    return res.json({ bookings: rows });
  }

  if (isFileFallbackDisabled()) return res.status(500).json({ error: 'No DB available' });
  const data = await readData();
  return res.json({ bookings: data.bookings.filter((b: any) => b.userId === userId) });
});

// List bookings (optionally filter by userId) — authenticated
router.get('/', ensureAuth, async (req: AuthRequest, res) => {
  const { userId } = req.query as any;
  if (await shouldUseSupabase()) {
    const rows = await getBookings(userId);
    const mapped = rows.map((r: any) => ({ id: r.id, userId: r.user_id, packageId: r.package_id, date: r.date, status: r.status, meta: r.meta }));
    return res.json({ bookings: mapped });
  }

  if (isDBConnected()) {
    const sql = getSql();
    const rows = userId ? await sql`SELECT * FROM bookings WHERE user_id = ${userId}` : await sql`SELECT * FROM bookings`;
    return res.json({ bookings: rows });
  }

  if (isFileFallbackDisabled()) return res.status(500).json({ error: 'No DB available' });

  const data = await readData();
  const list = userId ? data.bookings.filter((b) => b.userId === userId) : data.bookings;
  return res.json({ bookings: list });
});

// GET /bookings/slots?providerId=&date= — must be before /:id to avoid being matched as id
router.get('/slots', async (req, res) => {
  const { providerId, date } = req.query as any;
  if (!providerId || !date) return res.json([]);
  try {
    if (await shouldUseSupabase()) {
      const all = await getBookings();
      const booked = (all as any[])
        .filter((b) =>
          b.meta?.providerId === providerId &&
          (b.date || '').startsWith(date) &&
          b.status !== 'cancelled'
        )
        .map((b) => b.meta?.selectedTime)
        .filter(Boolean);
      return res.json(booked);
    }
  } catch { /* fall through */ }
  return res.json([]);
});

router.get('/:id', ensureAuth, async (req: AuthRequest, res) => {
  const { id } = req.params;
  if (isDBConnected()) {
    const sql = getSql();
    const rows = await sql`SELECT * FROM bookings WHERE id = ${id}`;
    if (!rows || !rows[0]) return res.status(404).json({ error: 'Not found' });
    return res.json({ booking: rows[0] });
  }
  // supabase REST
  if (isSupabaseConfigured()) {
    const row = await getBookingById(id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    return res.json({ booking: { id: row.id, userId: row.user_id, packageId: row.package_id, date: row.date, status: row.status, meta: row.meta } });
  }
  const data = await readData();
  const booking = data.bookings.find((b) => b.id === id);
  if (!booking) return res.status(404).json({ error: 'Not found' });
  return res.json({ booking });
});

// Pay for a booking (authenticated) — supports bypass for testing
router.post('/:id/pay', ensureAuth, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { amount, method, bypass, receipt } = req.body as any;
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  // find booking
  if (await shouldUseSupabase()) {
    try {
      let row = await getBookingById(id);
      // sometimes PostgREST/Postgres visibility can be eventually consistent — retry a few times before falling back
      if (!row && id) {
        for (let i = 0; i < 3; i++) {
          await new Promise((r) => setTimeout(r, 200));
          row = await getBookingById(id);
          if (row) break;
        }
      }

      // if booking found in Supabase, proceed with payment there
      if (row) {
        if (row.user_id !== userId) return res.status(403).json({ error: 'Forbidden' });
        if (row.status === 'paid') return res.json({ ok: true, message: 'Already paid' });

        // create payment record
        const pid = id?.toString() + '-pay-' + Date.now();
        const amt = amount || (row.meta && row.meta.price) || 0;
        const paymentPayload = { id: pid, booking_id: id, amount: amt, status: 'paid' };
        const p = await createPayment(paymentPayload);
        // mark booking paid and attach receipt in meta
        const receiptObj = { id: pid, amount: amt, method: method || (bypass ? 'bypass' : 'unknown'), note: receipt || null, ts: new Date().toISOString() };
        const newMeta = { ...(row.meta || {}), payment_receipt: receiptObj };
        const updated = await updateBooking(id, { status: 'paid', meta: newMeta });

        // Reserve the plot if one was booked
        if (newMeta.plotId) {
          try { await updatePlot(newMeta.plotId, { status: 'reserved' }); } catch { /* non-critical */ }
        }

        // notify user
        await notifyUser(userId, 'Payment received', `Your payment of Rs.${amt} has been received. Receipt: ${pid}`, 'payment_received', id?.toString());
        return res.json({ ok: true, payment: p, booking: { id: updated.id, status: updated.status, meta: updated.meta } });
      }
      // else fall through to check Postgres or file fallback
    } catch {
      // fall through to file fallback
    }
  }

  if (isDBConnected()) {
    const sql = getSql();
    const rows = await sql`SELECT * FROM bookings WHERE id = ${id}`;
    const row = rows && rows[0];
    if (!row) return res.status(404).json({ error: 'Not found' });
    if (row.user_id !== userId) return res.status(403).json({ error: 'Forbidden' });
    if (row.status === 'paid') return res.json({ ok: true, message: 'Already paid' });

    const pid = id?.toString() + '-pay-' + Date.now();
    const amt = amount || (row.meta && row.meta.price) || 0;
    await sql`INSERT INTO payments (id, booking_id, amount, status) VALUES (${pid}, ${id}, ${amt}, 'paid')`;
    await sql`UPDATE bookings SET status = 'paid', meta = ${ { ...(row.meta || {}), payment_receipt: { id: pid, amount: amt, method: method || (bypass ? 'bypass' : 'unknown') } } } WHERE id = ${id}`;
    await notifyUser(userId, 'Payment received', `Your payment of Rs.${amt} has been received. Receipt: ${pid}`, 'payment_received', id?.toString());
    const updated = await sql`SELECT * FROM bookings WHERE id = ${id}`;
    return res.json({ ok: true, payment: { id: pid, booking_id: id, amount: amt }, booking: updated[0] });
  }

  if (isFileFallbackDisabled()) return res.status(500).json({ error: 'No DB available' });

  // file fallback
  const data = await readData();
  const idx = data.bookings.findIndex((b) => b.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  if (data.bookings[idx].userId !== userId) return res.status(403).json({ error: 'Forbidden' });
  if (data.bookings[idx].status === 'paid') return res.json({ ok: true, message: 'Already paid' });
  const pid = id?.toString() + '-pay-' + Date.now();
  const amt = amount || (data.bookings[idx].meta && data.bookings[idx].meta.price) || 0;
  data.payments.push({ id: pid, bookingId: id, amount: amt, status: 'paid', created_at: new Date().toISOString() } as any);
  data.bookings[idx].status = 'paid';
  data.bookings[idx].meta = { ...(data.bookings[idx].meta || {}), payment_receipt: { id: pid, amount: amt, method: method || (bypass ? 'bypass' : 'unknown') } };
  await writeData(data);
  await notifyUser(userId, 'Payment received', `Your payment of Rs.${amt} has been received. Receipt: ${pid}`, 'payment_received', id?.toString());
  return res.json({ ok: true, payment: { id: pid, booking_id: id, amount: amt }, booking: data.bookings[idx] });
});

// POST /bookings/:id/cancel — cancel a booking
router.post('/:id/cancel', ensureAuth, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const userId = req.userId;

  if (await shouldUseSupabase()) {
    try {
      const row = await getBookingById(id);
      if (!row) return res.status(404).json({ error: 'Not found' });
      if (row.user_id !== userId) return res.status(403).json({ error: 'Forbidden' });
      const updated = await updateBooking(id, { status: 'cancelled' });
      return res.json({ ok: true, booking: updated });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'Cancel failed' });
    }
  }

  if (isDBConnected()) {
    const sql = getSql();
    const rows = await sql`SELECT * FROM bookings WHERE id = ${id}`;
    if (!rows?.[0]) return res.status(404).json({ error: 'Not found' });
    if (rows[0].user_id !== userId) return res.status(403).json({ error: 'Forbidden' });
    await sql`UPDATE bookings SET status = 'cancelled' WHERE id = ${id}`;
    return res.json({ ok: true });
  }

  if (isFileFallbackDisabled()) return res.status(500).json({ error: 'No DB available' });
  const data = await readData();
  const idx = data.bookings.findIndex((b: any) => b.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  data.bookings[idx].status = 'cancelled';
  await writeData(data);
  return res.json({ ok: true });
});

export default router;
