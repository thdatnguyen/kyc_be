import multer from 'multer';
import { badRequest } from '@core/utils/appError';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

// Memory storage: buffers stream straight to Cloudinary / local disk — never to a temp file.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      cb(badRequest('Only image files (JPEG, PNG, WebP, HEIC) are allowed'));
      return;
    }
    cb(null, true);
  },
});

export const uploadSingle = (field: string) => upload.single(field);
