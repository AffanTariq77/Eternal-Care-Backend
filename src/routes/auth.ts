import { Router } from 'express';
import { getSql, isDBConnected } from '../db';
import { readData, writeData } from '../store';
import { isSupabaseConfigured, getUserByEmail, createUser, addPushToken, getUserTokens } from '../supabase';
import { shouldUseSupabase, isFileFallbackDisabled } from '../dbAdapter';
import { id } from '../utils/id';
import { getJwtSecret } from '../middleware/auth';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/signup', async (req, res) => {
  const { name, email, password, expoPushToken } = req.body as any;
  if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'Valid email is required' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });

  if (await shouldUseSupabase()) {
    try {
      const existing = await getUserByEmail(email);
      if (existing) return res.status(409).json({ error: 'Email already exists' });
      const uid = id();
      const hash = bcrypt.hashSync(password, 10);
      const row = await createUser({ id: uid, name: name.trim(), email, password_hash: hash });
      if (!row) return res.status(500).json({ error: 'Failed to create user' });
      const role = row.role ?? 'user';
      const token = jwt.sign({ userId: uid, email, role }, getJwtSecret(), { expiresIn: '7d' });
      if (expoPushToken) {
        try {
          const { added } = await addPushToken(uid, expoPushToken as string) as any;
          if (added) {
            await import('../notifications').then((m) => m.sendExpoPush(expoPushToken as string, 'Welcome', 'Your account was created.'));
          }
        } catch { /* non-critical */ }
      }
      return res.json({ user: { id: uid, name: name.trim(), email, role, avatar_url: null }, token });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'Signup failed' });
    }
  }

  if (isDBConnected()) {
    const sql = getSql();
    const existing = await sql`SELECT id FROM users WHERE email = ${email}`;
    if (existing && existing.length) return res.status(409).json({ error: 'Email already exists' });
    const uid = id();
    const hash = bcrypt.hashSync(password, 10);
    await sql`INSERT INTO users (id, name, email, password) VALUES (${uid}, ${name.trim()}, ${email}, ${hash})`;
    const token = jwt.sign({ userId: uid, email, role: 'user' }, getJwtSecret(), { expiresIn: '7d' });
    return res.json({ user: { id: uid, name: name.trim(), email, role: 'user' }, token });
  }

  if (isFileFallbackDisabled()) return res.status(500).json({ error: 'No DB available' });

  const data = await readData();
  const existing = data.users.find((u) => u.email === email);
  if (existing) return res.status(409).json({ error: 'Email already exists' });
  const uid = id();
  const hash = bcrypt.hashSync(password, 10);
  data.users.push({ id: uid, name: name.trim(), email, password: hash } as any);
  await writeData(data);
  const token = jwt.sign({ userId: uid, email, role: 'user' }, getJwtSecret(), { expiresIn: '7d' });
  return res.json({ user: { id: uid, name: name.trim(), email, role: 'user' }, token });
});

router.post('/login', async (req, res) => {
  const { email, password, expoPushToken } = req.body as any;
  if (!email || !password) return res.status(400).json({ error: 'email & password required' });

  if (await shouldUseSupabase()) {
    try {
      const user = await getUserByEmail(email);
      if (!user) return res.status(401).json({ error: 'Invalid credentials' });
      const ok = bcrypt.compareSync(password, user.password_hash as string);
      if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
      const role = user.role ?? 'user';
      const token = jwt.sign({ userId: user.id, email: user.email, role }, getJwtSecret(), { expiresIn: '7d' });
      if (expoPushToken) {
        try {
          const tokensBefore = await getUserTokens(user.id);
          const { added } = await addPushToken(user.id, expoPushToken as string) as any;
          if (added) {
            const others = (tokensBefore || []).filter((t: string) => t !== expoPushToken);
            if (others.length) await import('../notifications').then((m) => m.sendMany(others, 'Security notice', 'Your account was signed in from a new device'));
            await import('../notifications').then((m) => m.sendExpoPush(expoPushToken as string, 'Signed in', 'You are signed in on this device'));
          }
        } catch { /* non-critical */ }
      }
      return res.json({ user: { id: user.id, name: user.name, email: user.email, role, avatar_url: user.avatar_url || null }, token });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'Login failed' });
    }
  }

  if (isDBConnected()) {
    const sql = getSql();
    const rows = await sql`SELECT id, name, email, password, role FROM users WHERE email = ${email}`;
    const user = rows && rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = bcrypt.compareSync(password, user.password as string);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const role = user.role ?? 'user';
    const token = jwt.sign({ userId: user.id, email, role }, getJwtSecret(), { expiresIn: '7d' });
    return res.json({ user: { id: user.id, name: user.name, email: user.email, role }, token });
  }

  if (isFileFallbackDisabled()) return res.status(500).json({ error: 'No DB available' });

  const data = await readData();
  const user = data.users.find((u) => u.email === email);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const ok = bcrypt.compareSync(password, user.password as string);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ userId: user.id, email, role: 'user' }, getJwtSecret(), { expiresIn: '7d' });
  return res.json({ user: { id: user.id, name: user.name, email: user.email, role: 'user' }, token });
});

router.post('/register-token', async (req: any, res: any) => {
  const auth = req.headers?.authorization?.split(' ')[1];
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload: any = jwt.verify(auth, getJwtSecret());
    const userId = payload.userId;
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'token required' });
    if (await shouldUseSupabase()) {
      const tokensBefore = await getUserTokens(userId);
      const { added } = await addPushToken(userId, token) as any;
      if (added) {
        const others = (tokensBefore || []).filter((t: string) => t !== token);
        if (others.length) await import('../notifications').then((m) => m.sendMany(others, 'Security notice', 'Your account was signed in from a new device'));
        await import('../notifications').then((m) => m.sendExpoPush(token, 'Signed in', 'You are signed in on this device'));
      }
      return res.json({ ok: true, added });
    }
    const data = await readData();
    const idx = data.users.findIndex((u) => u.id === userId);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    const tokens = data.users[idx].expo_tokens || [];
    if (!tokens.includes(token)) {
      data.users[idx].expo_tokens = [...tokens, token];
      await writeData(data);
      const others = tokens.filter((t: string) => t !== token);
      if (others.length) await import('../notifications').then((m) => m.sendMany(others, 'Security notice', 'Your account was signed in from a new device'));
      await import('../notifications').then((m) => m.sendExpoPush(token, 'Signed in', 'You are signed in on this device'));
      return res.json({ ok: true, added: true });
    }
    return res.json({ ok: true, added: false });
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
});

export default router;
