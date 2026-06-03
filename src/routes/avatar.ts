import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { ensureAuth, AuthRequest } from '../middleware/auth';
import { updateProfile, uploadAvatar } from '../supabase';

const upload = multer({
  storage: multer.memoryStorage(),
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

  const ext = path.extname(req.file.originalname) || '.jpg';

  try {
    const avatarUrl = await uploadAvatar(id, req.file.buffer, req.file.mimetype, ext);
    await updateProfile(id, { avatar_url: avatarUrl });
    return res.json({ avatarUrl });
  } catch (e: any) {
    console.error('Avatar upload failed:', e?.message);
    return res.status(500).json({ error: 'Failed to upload avatar' });
  }
});

export default router;
