import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  userId?: string;
}

export function ensureAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' });
  const token = h.slice(7);
  try {
    const secret = process.env.JWT_SECRET || 'change-me';
    const payload = jwt.verify(token, secret) as any;
    req.userId = payload.userId;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
