import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { ensureAuth, AuthRequest } from '../middleware/auth';
import { shouldUseSupabase, isFileFallbackDisabled } from '../dbAdapter';
import { updateProfile } from '../supabase';
import { readData, writeData } from '../store';

const UPLOADS_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `avatar_${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

const router = Router();

// POST /avatar/:id  — multipart/form-data with field "avatar"
router.post('/:id', ensureAuth, upload.single('avatar'), async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  if (req.userId !== id) return res.status(403).json({ error: 'Forbidden' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const host = `${req.protocol}://${req.get('host')}`;
  const avatarUrl = `${host}/uploads/${req.file.filename}`;

  if (await shouldUseSupabase()) {
    try {
      await updateProfile(id, { avatar_url: avatarUrl });
    } catch (e: any) {
      console.error('Failed to save avatar_url to Supabase:', e?.message);
    }
  } else if (!isFileFallbackDisabled()) {
    const data = await readData();
    const idx = data.users.findIndex((u) => u.id === id);
    if (idx !== -1) {
      (data.users[idx] as any).avatar_url = avatarUrl;
      await writeData(data);
    }
  }

  return res.json({ avatarUrl });
});

export default router;
