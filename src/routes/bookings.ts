import { Router } from 'express';
import { getSql, isDBConnected } from '../db';
import { readData, writeData } from '../store';
import { isSupabaseConfigured, createBooking, getBookings, getBookingById, createPayment, updateBooking, getUserTokens } from '../supabase';
import { shouldUseSupabase, isFileFallbackDisabled } from '../dbAdapter';
import { id } from '../utils/id';
import { ensureAuth, AuthRequest } from '../middleware/auth';
const router = Router();

// Create booking (authenticated)
router.post('/', ensureAuth, async (req: AuthRequest, res) => {
  const userId = req.userId;
  const { packageId, date, meta } = req.body as any;
  const missing: string[] = [];
  if (!userId) missing.push('user');
  if (!packageId) missing.push('packageId');
  if (!date) missing.push('date');
  if (missing.length) return res.status(400).json({ error: `Missing fields: ${missing.join(', ')}` });
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
              data.bookings.push({ id: row.id, userId, packageId: row.package_id, date: row.date, status: row.status, meta: row.meta });
              await writeData(data);
            }
          }
        } catch (e) {
          console.warn('Mirroring booking to file fallback failed', e?.message || e);
        }
        return res.json({ booking: { id: row.id, userId: row.user_id, packageId: row.package_id, date: row.date, status: row.status, meta: row.meta } });
      }
      // if API returned null/empty, fall through to other adapters
      console.warn('Supabase createBooking returned no row, falling back to other stores');
    } catch (err) {
      console.warn('Supabase createBooking failed, falling back to other stores', err?.message || err);
      // fall through to Postgres or file fallback
    }
  }

  if (isDBConnected()) {
    const sql = getSql();
    await sql`INSERT INTO bookings (id, user_id, package_id, date, status, meta) VALUES (${bid}, ${userId}, ${packageId}, ${date}, 'pending', ${meta})`;
    const rows = await sql`SELECT id, user_id, package_id, date, status, meta FROM bookings WHERE id = ${bid}`;
    return res.json({ booking: rows[0] });
  }

  if (isFileFallbackDisabled()) return res.status(500).json({ error: 'No DB available' });

  // fallback
  const data = await readData();
  const booking = { id: bid, userId, packageId, date, status: 'pending', meta } as any;
  data.bookings.push(booking);
  await writeData(data);
  return res.json({ booking });
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

  console.log('PAY: start', { id, userId, shouldUseSupabase: await shouldUseSupabase(), isDBConnected: isDBConnected() });

  // helper to notify user
  async function notifyUser(userId: string, title: string, body: string) {
    try {
      const tokens = await getUserTokens(userId);
      if (tokens && tokens.length) {
        await import('../notifications').then((m) => m.sendMany(tokens, title, body));
      }
    } catch (e) {
      console.warn('Notification failed', e);
    }
  }

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
        const updated = await updateBooking(id, { status: 'paid', meta: { ...(row.meta || {}), payment_receipt: receiptObj } });

        // notify user
        await notifyUser(userId, 'Payment received', `Payment of Rs.${amt} received. Receipt: ${pid}`);
        return res.json({ ok: true, payment: p, booking: { id: updated.id, status: updated.status, meta: updated.meta } });
      }
      // else fall through to check Postgres or file fallback
    } catch (err) {
      console.warn('Supabase payment path failed, falling back to file store', err?.message || err);
      // fall through to file fallback below
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
    await notifyUser(userId, 'Payment received', `Payment of Rs.${amt} received. Receipt: ${pid}`);
    const updated = await sql`SELECT * FROM bookings WHERE id = ${id}`;
    return res.json({ ok: true, payment: { id: pid, booking_id: id, amount: amt }, booking: updated[0] });
  }

  if (isFileFallbackDisabled()) return res.status(500).json({ error: 'No DB available' });

  // file fallback
  const data = await readData();
  console.log('PAY: file fallback has', (data.bookings || []).length, 'bookings - ids:', (data.bookings || []).map(b => b.id).slice(0,10));
  const idx = data.bookings.findIndex((b) => b.id === id);
  console.log('PAY: searching for', id, 'found index', idx);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  if (data.bookings[idx].userId !== userId) return res.status(403).json({ error: 'Forbidden' });
  if (data.bookings[idx].status === 'paid') return res.json({ ok: true, message: 'Already paid' });
  const pid = id?.toString() + '-pay-' + Date.now();
  const amt = amount || (data.bookings[idx].meta && data.bookings[idx].meta.price) || 0;
  data.payments.push({ id: pid, booking_id: id, amount: amt, status: 'paid', created_at: new Date().toISOString() });
  data.bookings[idx].status = 'paid';
  data.bookings[idx].meta = { ...(data.bookings[idx].meta || {}), payment_receipt: { id: pid, amount: amt, method: method || (bypass ? 'bypass' : 'unknown') } };
  await writeData(data);
  await notifyUser(userId, 'Payment received', `Payment of Rs.${amt} received. Receipt: ${pid}`);
  return res.json({ ok: true, payment: { id: pid, booking_id: id, amount: amt }, booking: data.bookings[idx] });
});

export default router;
