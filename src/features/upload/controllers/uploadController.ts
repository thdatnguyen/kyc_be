import { Request, Response, NextFunction } from 'express';
import { getStorage } from '@core/utils/storage';
import { Media } from '@features/upload/models/Media';
import { badRequest, forbidden, notFound } from '@core/utils/appError';
import { sendSuccess } from '@core/utils/responseFormatter';

export async function uploadImage(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) throw badRequest('No image file provided');
    const kind = req.body.kind === 'selfie' ? 'selfie' : 'document';

    const result = await getStorage().upload({
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
    });

    // Record ownership so media can only be fetched by its owner (or an Admin).
    await Media.create({ publicId: result.publicId, owner: req.user!.userId, kind });

    return sendSuccess(res, { publicId: result.publicId, kind }, 201, 'Image uploaded');
  } catch (error) {
    next(error);
  }
}

export async function serveMedia(req: Request, res: Response, next: NextFunction) {
  try {
    const publicId = decodeURIComponent(req.params.publicId);
    const media = await Media.findOne({ publicId });
    if (!media) throw notFound('Media not found');

    // Object-level authorization: owner or Admin only.
    if (media.owner.toString() !== req.user!.userId && req.user!.role !== 'Admin') {
      throw forbidden('Access denied to this media');
    }

    const storage = getStorage();
    if (storage.name === 'cloudinary') {
      const url = await storage.getSignedUrl(publicId);
      return res.redirect(url);
    }

    const buffer = await storage.read(publicId);
    res.setHeader('Content-Type', mimeFor(publicId));
    res.setHeader('Cache-Control', 'private, max-age=60');
    return res.send(buffer);
  } catch (error) {
    next(error);
  }
}

function mimeFor(publicId: string): string {
  if (/\.png$/i.test(publicId)) return 'image/png';
  if (/\.webp$/i.test(publicId)) return 'image/webp';
  if (/\.heic$/i.test(publicId)) return 'image/heic';
  if (/\.heif$/i.test(publicId)) return 'image/heif';
  return 'image/jpeg';
}
