import { Router } from 'express';
import { getSql, isDBConnected } from '../db';
import { readData, writeData } from '../store';
import { isSupabaseConfigured, getUserByEmail, createUser } from '../supabase';
import { shouldUseSupabase, isFileFallbackDisabled } from '../dbAdapter';
import { id } from '../utils/id';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
const router = Router();

// Signup: DB when available, otherwise fallback to file
router.post('/signup', async (req, res) => {
  const { name, email, password, expoPushToken } = req.body as any;
  if (!email || !password) return res.status(400).json({ error: 'email & password required' });
  // prefer Supabase (configurable) then Postgres then file fallback
  if (await shouldUseSupabase()) {
    const existing = await getUserByEmail(email);
    if (existing) return res.status(409).json({ error: 'Email already exists' });
    const uid = id();
    const hash = bcrypt.hashSync(password, 10);
    const row = await createUser({ id: uid, name: name || '', email, password_hash: hash });
    if (!row) return res.status(500).json({ error: 'Failed to create user in Supabase' });
    const token = jwt.sign({ userId: uid }, process.env.JWT_SECRET || 'change-me', { expiresIn: '7d' });
    // register push token if provided
    if (expoPushToken) {
      try {
        const { added } = await addPushToken(uid, expoPushToken as string) as any;
        if (added) {
          // send welcome to new device
          await import('../notifications').then((m) => m.sendExpoPush(expoPushToken as string, 'Welcome', 'Your account was created and signed in.'));
        }
      } catch (e) {
        console.warn('Failed to register push token', e);
      }
    }
    return res.json({ user: { id: uid, name: name || '', email }, token });
  }

  if (isDBConnected()) {
    const sql = getSql();
    const existing = await sql`SELECT id FROM users WHERE email = ${email}`;
    if (existing && existing.length) return res.status(409).json({ error: 'Email already exists' });
    const uid = id();
    const hash = bcrypt.hashSync(password, 10);
    await sql`INSERT INTO users (id, name, email, password) VALUES (${uid}, ${name || ''}, ${email}, ${hash})`;
    const token = jwt.sign({ userId: uid }, process.env.JWT_SECRET || 'change-me', { expiresIn: '7d' });
    return res.json({ user: { id: uid, name: name || '', email }, token });
  }

  if (isFileFallbackDisabled()) return res.status(500).json({ error: 'No DB available' });

  // fallback to file store
  const data = await readData();
  const existing = data.users.find((u) => u.email === email);
  if (existing) return res.status(409).json({ error: 'Email already exists' });
  const uid = id();
  const hash = bcrypt.hashSync(password, 10);
  const user = { id: uid, name: name || '', email, password: hash } as any;
  data.users.push(user);
  await writeData(data);
  const token = jwt.sign({ userId: uid }, process.env.JWT_SECRET || 'change-me', { expiresIn: '7d' });
  return res.json({ user: { id: uid, name: name || '', email }, token });
});

// Login: DB when available, otherwise fallback to file store
router.post('/login', async (req, res) => {
  const { email, password } = req.body as any;
  if (!email || !password) return res.status(400).json({ error: 'email & password required' });
  // prefer Supabase then Postgres then file fallback
  if (await shouldUseSupabase()) {
    const user = await getUserByEmail(email);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = bcrypt.compareSync(password, user.password_hash as string);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'change-me', { expiresIn: '7d' });

    const expoPushToken = req.body?.expoPushToken;
    if (expoPushToken) {
      try {
        const tokensBefore = await getUserTokens(user.id);
        const { added } = await addPushToken(user.id, expoPushToken as string) as any;
        if (added) {
          // notify existing tokens about new device login
          const existing = tokensBefore || [];
          const others = existing.filter((t: string) => t !== expoPushToken);
          if (others && others.length) {
            await import('../notifications').then((m) => m.sendMany(others, 'Security notice', 'Your account was signed in from a new device')); 
          }
          // send confirmation to the new device
          await import('../notifications').then((m) => m.sendExpoPush(expoPushToken as string, 'Signed in', 'You are signed in on this device'));
        }
      } catch (e) {
        console.warn('push token registration failed', e);
      }
    }

    return res.json({ user: { id: user.id, name: user.name, email: user.email }, token });
  }

  if (isDBConnected()) {
    const sql = getSql();
    const rows = await sql`SELECT id, name, email, password FROM users WHERE email = ${email}`;
    const user = rows && rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = bcrypt.compareSync(password, user.password as string);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'change-me', { expiresIn: '7d' });
    return res.json({ user: { id: user.id, name: user.name, email: user.email }, token });
  }

  if (isFileFallbackDisabled()) return res.status(500).json({ error: 'No DB available' });

  const data = await readData();
  const user = data.users.find((u) => u.email === email);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const ok = bcrypt.compareSync(password, user.password as string);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'change-me', { expiresIn: '7d' });
  return res.json({ user: { id: user.id, name: user.name, email: user.email }, token });
});


// register a push token for an authenticated user
router.post('/register-token', async (req: any, res: any) => {
  const auth = req.headers?.authorization?.split(' ')[1];
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload: any = jwt.verify(auth, process.env.JWT_SECRET || 'change-me');
    const userId = payload.userId;
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'token required' });
    // try supabase first
    if (await shouldUseSupabase()) {
      const tokensBefore = await getUserTokens(userId);
      const { added } = await addPushToken(userId, token) as any;
      if (added) {
        // notify other devices
        const others = (tokensBefore || []).filter((t: string) => t !== token);
        if (others.length) await import('../notifications').then((m) => m.sendMany(others, 'Security notice', 'Your account was signed in from a new device'));
        // send confirmation to new device
        await import('../notifications').then((m) => m.sendExpoPush(token, 'Signed in', 'You are signed in on this device'));
      }
      return res.json({ ok: true, added });
    }
    // file fallback
    const data = await readData();
    const idx = data.users.findIndex((u) => u.id === userId);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    const tokens = data.users[idx].expo_tokens || [];
    if (!tokens.includes(token)) {
      data.users[idx].expo_tokens = [...tokens, token];
      await writeData(data);
      // notify others
      const others = tokens.filter((t: string) => t !== token);
      if (others.length) await import('../notifications').then((m) => m.sendMany(others, 'Security notice', 'Your account was signed in from a new device'));
      await import('../notifications').then((m) => m.sendExpoPush(token, 'Signed in', 'You are signed in on this device'));
      return res.json({ ok: true, added: true });
    }
    return res.json({ ok: true, added: false });
  } catch (err: any) {
    return res.status(401).json({ error: 'Invalid token' });
  }
});

export default router;
