import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { v2 as cloudinary } from 'cloudinary';
import { env } from '@core/config/env';
import { logger } from '@core/config/logger';

export interface UploadInput {
  buffer: Buffer;
  mimetype: string;
  originalname?: string;
}

export interface UploadResult {
  publicId: string;
  url?: string;
}

export interface StorageProvider {
  readonly name: 'cloudinary' | 'local';
  upload(file: UploadInput, folder?: string): Promise<UploadResult>;
  delete(publicId: string): Promise<void>;
  getSignedUrl(publicId: string, expiresSeconds?: number): Promise<string>;
  read(publicId: string): Promise<Buffer>;
}

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

function extFor(mimetype: string): string {
  return EXT_BY_MIME[mimetype] ?? 'bin';
}

// ---------------------------------------------------------------------------
// Cloudinary — production. Assets are uploaded PRIVATE and served only via
// short-lived signed URLs generated here (never public).
// ---------------------------------------------------------------------------
class CloudinaryStorage implements StorageProvider {
  readonly name = 'cloudinary' as const;

  constructor() {
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
    });
  }

  upload(file: UploadInput, folder = env.CLOUDINARY_FOLDER): Promise<UploadResult> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          type: 'private', // private asset: requires a signed URL to access
          resource_type: 'image',
        },
        (error, result) => {
          if (error) return reject(error);
          resolve({ publicId: result!.public_id, url: result!.secure_url });
        },
      );
      stream.end(file.buffer);
    });
  }

  async delete(publicId: string): Promise<void> {
    await cloudinary.uploader.destroy(publicId, { type: 'private', resource_type: 'image' });
  }

  async getSignedUrl(publicId: string, expiresSeconds = env.MEDIA_URL_TTL_SECONDS): Promise<string> {
    return cloudinary.url(publicId, {
      resource_type: 'image',
      type: 'private',
      secure: true,
      sign_url: true,
      expires_at: Math.floor(Date.now() / 1000) + expiresSeconds,
    });
  }

  async read(publicId: string): Promise<Buffer> {
    // Download the private asset's bytes via a fresh signed URL (used by the
    // server-side face-match step, which needs raw image data).
    const url = await this.getSignedUrl(publicId);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch asset ${publicId}: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
}

// ---------------------------------------------------------------------------
// Local — dev/CI fallback. Files live outside the web root and are served only
// through the authenticated /api/media endpoint.
// ---------------------------------------------------------------------------
class LocalStorage implements StorageProvider {
  readonly name = 'local' as const;
  private root: string;

  constructor() {
    this.root = path.resolve(process.cwd(), env.LOCAL_UPLOAD_DIR);
    if (!fs.existsSync(this.root)) fs.mkdirSync(this.root, { recursive: true });
  }

  private resolve(publicId: string): string {
    // Guard against path traversal.
    const safe = path.normalize(publicId).replace(/^(\.\.[/\\])+/, '');
    const full = path.resolve(this.root, safe);
    if (!full.startsWith(this.root)) throw new Error('Invalid publicId');
    return full;
  }

  async upload(file: UploadInput, folder = 'kyc'): Promise<UploadResult> {
    const publicId = `${folder}/${crypto.randomUUID()}.${extFor(file.mimetype)}`;
    const target = this.resolve(publicId);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.buffer);
    return { publicId };
  }

  async delete(publicId: string): Promise<void> {
    const target = this.resolve(publicId);
    if (fs.existsSync(target)) fs.unlinkSync(target);
  }

  async getSignedUrl(publicId: string): Promise<string> {
    // Local assets are already behind the authenticated media endpoint.
    return `/api/media/${encodeURIComponent(publicId)}`;
  }

  async read(publicId: string): Promise<Buffer> {
    return fs.promises.readFile(this.resolve(publicId));
  }
}

// ---------------------------------------------------------------------------
// Factory — selects Cloudinary when configured, otherwise local fallback.
// ---------------------------------------------------------------------------
let provider: StorageProvider | undefined;

export function getStorage(): StorageProvider {
  if (provider) return provider;

  const cloudinaryConfigured = Boolean(
    env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET,
  );
  const requested = env.STORAGE_DRIVER;

  if (requested === 'cloudinary') {
    if (!cloudinaryConfigured) {
      throw new Error('STORAGE_DRIVER=cloudinary but CLOUDINARY_* env vars are missing');
    }
    provider = new CloudinaryStorage();
  } else if (requested === 'local') {
    provider = new LocalStorage();
  } else {
    // Auto: prefer Cloudinary when keys are present, else local.
    if (cloudinaryConfigured) {
      provider = new CloudinaryStorage();
    } else {
      logger.warn('Cloudinary keys not set — using local storage fallback');
      provider = new LocalStorage();
    }
  }

  return provider;
}
