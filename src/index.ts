// Side-effect import: registers dotenv before any other module reads process.env
import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import health from './routes/health';
import auth from './routes/auth';
import bookings from './routes/bookings';
import profile from './routes/profile';
import admin from './routes/admin';
import { initDB } from './db';
import { isSupabaseConfigured } from './supabase';

const app = express();
app.use(cors());
app.use(express.json());

app.use('/health', health);
app.use('/auth', auth);
app.use('/bookings', bookings);
app.use('/profile', profile);
app.use('/admin', admin);

const PORT = process.env.PORT || 4000;

(async () => {
  if (process.env.FORCE_SUPABASE_REST === '1' && isSupabaseConfigured()) {
    console.log('[DB] Using Supabase REST adapter.');
  } else {
    const ok = await initDB();
    if (ok) {
      console.log('[DB] Postgres connected and ready.');
    } else if (isSupabaseConfigured()) {
      console.log('[DB] Postgres unavailable. Using Supabase REST adapter.');
    } else {
      console.warn('[DB] No database available — falling back to file store.');
    }
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Eternal Care backend listening on port ${PORT}`);
  });
})();
