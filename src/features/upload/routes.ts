import { Router } from 'express';
import { authMiddleware } from '@core/middlewares/authMiddleware';
import { requireRole } from '@core/middlewares/rbacMiddleware';
import { uploadSingle } from '@core/middlewares/uploadMiddleware';
import { uploadLimiter } from '@core/config/rateLimiter';
import { uploadImage, serveMedia } from '@features/upload/controllers/uploadController';

// POST /api/upload  (multipart: field "image", plus body field "kind" = document|selfie)
export const uploadRouter = Router();
uploadRouter.post(
  '/',
  authMiddleware,
  requireRole(['Applicant']),
  uploadLimiter,
  uploadSingle('image'),
  uploadImage,
);

// GET /api/media/:publicId  (authenticated, owner-or-Admin)
export const mediaRouter = Router();
mediaRouter.get('/:publicId', authMiddleware, serveMedia);
