import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import health from './routes/health';
import auth from './routes/auth';
import bookings from './routes/bookings';
import profile from './routes/profile';
import admin from './routes/admin';
import { initDB } from './db';

dotenv.config();

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
  const ok = await initDB();
  if (ok) {
    console.log('Database initialized and ready');
  } else {
    console.warn('DB not available — running in fallback mode (file store).');
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Eternal Care backend listening on port ${PORT}`);
  });
})();
