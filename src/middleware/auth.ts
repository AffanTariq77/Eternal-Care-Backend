import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  userId?: string;
  userEmail?: string;
  userRole?: string;
}

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET environment variable is not set');
  return secret;
}

export function ensureAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' });
  const token = h.slice(7);
  try {
    const payload = jwt.verify(token, getJwtSecret()) as any;
    req.userId = payload.userId;
    req.userEmail = payload.email;
    req.userRole = payload.role;
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
