import { Router } from 'express';
import { isDBConnected, getLastDBError } from '../db';
const router = Router();

router.get('/', (_req, res) => {
  const dbAvailable = isDBConnected();
  const dbError = getLastDBError();
  res.json({ status: 'ok', time: new Date().toISOString(), db: dbAvailable ? 'connected' : 'unavailable', dbError: dbError ?? undefined });
});

export default router;
