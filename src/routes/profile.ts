import { Router } from 'express';
import { getSql, isDBConnected } from '../db';
import { ensureAuth, AuthRequest } from '../middleware/auth';
import { readData, writeData } from '../store';
import { isSupabaseConfigured, getProfile, updateProfile } from '../supabase';
import { shouldUseSupabase, isFileFallbackDisabled } from '../dbAdapter';
const router = Router();

router.get('/:id', ensureAuth, async (req: AuthRequest, res) => {
  const { id } = req.params;
  // basic access control: allow only same user or admin (no admin here)
  if (req.userId !== id) return res.status(403).json({ error: 'Forbidden' });

  // Prefer Supabase REST when configured to do so
  if (shouldUseSupabase()) {
    const u = await getProfile(id);
    if (!u) return res.status(404).json({ error: 'Not found' });
    return res.json({ user: { id: u.id, name: u.name, email: u.email, phone: u.phone, address: u.address, avatar_url: u.avatar_url, created_at: u.created_at } });
  }

  // Try direct DB connection next
  if (isDBConnected()) {
    const sql = getSql();
    const rows = await sql`SELECT id, name, email, phone, address, avatar_url, created_at FROM users WHERE id = ${id}`;
    if (!rows || !rows[0]) return res.status(404).json({ error: 'Not found' });
    return res.json({ user: rows[0] });
  }

  // If DB not available, but supabase REST is configured, use it as a fallback
  if (isSupabaseConfigured()) {
    const u = await getProfile(id);
    if (!u) return res.status(404).json({ error: 'Not found' });
    return res.json({ user: { id: u.id, name: u.name, email: u.email, phone: u.phone, address: u.address, avatar_url: u.avatar_url, created_at: u.created_at } });
  }

  // File fallback
  if (isFileFallbackDisabled()) return res.status(503).json({ error: 'Service unavailable' });
  const data = await readData();
  const user = data.users.find((u) => u.id === id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  const { password: _p, ...safe } = user as any;
  return res.json({ user: safe });
});

router.put('/:id', ensureAuth, async (req: AuthRequest, res) => {
  const { id } = req.params;
  if (req.userId !== id) return res.status(403).json({ error: 'Forbidden' });
  const updates = req.body as any;

  // Prefer Supabase REST when configured to do so
  if (shouldUseSupabase()) {
    const updated = await updateProfile(id, updates);
    return res.json({ user: { id: updated.id, name: updated.name, email: updated.email, phone: updated.phone, address: updated.address } });
  }

  // Try direct DB connection next
  if (isDBConnected()) {
    const sql = getSql();
    await sql`UPDATE users SET name = COALESCE(${updates.name}, name), email = COALESCE(${updates.email}, email) WHERE id = ${id}`;
    const rows = await sql`SELECT id, name, email FROM users WHERE id = ${id}`;
    return res.json({ user: rows[0] });
  }

  // If DB not available, but supabase REST is configured, use it as a fallback
  if (isSupabaseConfigured()) {
    const updated = await updateProfile(id, updates);
    return res.json({ user: { id: updated.id, name: updated.name, email: updated.email } });
  }

  // File fallback
  if (isFileFallbackDisabled()) return res.status(503).json({ error: 'Service unavailable' });
  const data = await readData();
  const idx = data.users.findIndex((u) => u.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  data.users[idx] = { ...data.users[idx], ...updates } as any;
  await writeData(data);
  const { password: _p, ...safe } = data.users[idx] as any;
  return res.json({ user: safe });
});

export default router;