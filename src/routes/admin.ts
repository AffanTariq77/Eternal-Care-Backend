import { Router } from 'express';
import { isDBConnected, getLastDBError, getSql, initDB } from '../db';
import { shouldUseSupabase } from '../dbAdapter';
const router = Router();

const ADMIN_KEY = process.env.ADMIN_KEY || 'dev-admin-key';

function requireKey(req: any, res: any, next: any) {
  const key = req.query.key || req.headers['x-admin-key'];
  if (key !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// GET /admin/db - returns DB status and lists tables when connected
router.get('/db', requireKey, async (_req, res) => {
  const dbAvailable = isDBConnected();
  const dbError = getLastDBError();
  if (!dbAvailable) return res.json({ db: 'unavailable', dbError: dbError ?? null });
  try {
    const sql = getSql();
    const tables = await sql`select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE'`;
    return res.json({ db: 'connected', tables, dbError: null });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || String(err) });
  }
});

// POST /admin/migrate - force running migrations (initDB)
router.post('/migrate', requireKey, async (_req, res) => {
  try {
    const ok = await initDB();
    if (!ok) return res.status(500).json({ ok: false, message: 'DB not available' });
    const sql = getSql();
    const tables = await sql`select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE'`;
    return res.json({ ok: true, tables });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

// quick check whether Supabase REST is configured in this process
router.get('/supaconfig', requireKey, (_req, res) => {
  try {
    const ok = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE);
    const force = process.env.FORCE_SUPABASE_REST === '1';
    const disableFallback = process.env.DISABLE_FILE_FALLBACK === '1';
    const useSupabase = shouldUseSupabase();
    return res.json({ supabaseConfigured: ok, forceSupabaseRest: force, fileFallbackDisabled: disableFallback, useSupabase });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

export default router;
