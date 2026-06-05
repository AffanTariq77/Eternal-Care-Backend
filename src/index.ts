// Side-effect import: registers dotenv before any other module reads process.env
import 'dotenv/config';

// Fail fast if JWT_SECRET is not configured
if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set. Refusing to start.');
  process.exit(1);
}

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import health from './routes/health';
import auth from './routes/auth';
import bookings from './routes/bookings';
import profile from './routes/profile';
import admin from './routes/admin';
import payments from './routes/payments';
import avatar from './routes/avatar';
import graveyards from './routes/graveyards';
import providers from './routes/providers';
import notifications from './routes/notifications';
import support from './routes/support';
import { initDB } from './db';
import { isSupabaseConfigured } from './supabase';

const app = express();

// Security headers
app.use(helmet());

// CORS — allow mobile app and localhost dev
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:8081').split(',');
app.use(cors({
  origin: (origin, cb) => {
    // allow requests with no origin (mobile apps, curl)
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    cb(null, true); // permissive for now; restrict to allowedOrigins in production
  },
  credentials: true,
}));

app.use(express.json());

// Rate limiting
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
const paymentLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });

app.use('/health', health);
app.use('/auth', authLimiter, auth);
app.use('/bookings', bookings);
app.use('/profile', profile);
app.use('/admin', admin);
app.use('/payments', paymentLimiter, payments);
app.use('/avatar', avatar);
app.use('/graveyards', graveyards);
app.use('/service-providers', providers);
app.use('/notifications', notifications);
app.use('/support', support);

// Global error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
});

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
