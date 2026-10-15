import dotenv from 'dotenv';

// Support ENV_FILE override for different environments (dev, test, production).
dotenv.config({ path: process.env.ENV_FILE || '.env' });

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '5000', 10),
  // Number of reverse-proxy hops to trust for req.ip (Railway = 1).
  TRUST_PROXY: parseInt(process.env.TRUST_PROXY || '1', 10),

  // Account lockout (credential-stuffing defense — independent of IP).
  LOGIN_MAX_ATTEMPTS: parseInt(process.env.LOGIN_MAX_ATTEMPTS || '5', 10),
  LOGIN_LOCK_MS: parseInt(process.env.LOGIN_LOCK_MS || '900000', 10), // 15 min
  LOGIN_ATTEMPT_TTL_MS: parseInt(process.env.LOGIN_ATTEMPT_TTL_MS || '86400000', 10), // 24 h

  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/kyc',
  MONGO_DB_NAME: process.env.MONGO_DB_NAME || 'kyc',

  JWT_SECRET: process.env.JWT_SECRET || 'dev_access_secret_change_in_production',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '15m',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret_change_in_production',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '30d',

  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
  LOG_DIR: process.env.LOG_DIR,

  STORAGE_DRIVER: process.env.STORAGE_DRIVER,
  LOCAL_UPLOAD_DIR: process.env.LOCAL_UPLOAD_DIR || 'uploads',
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
  CLOUDINARY_FOLDER: process.env.CLOUDINARY_FOLDER || 'kyc',
  MEDIA_URL_TTL_SECONDS: parseInt(process.env.MEDIA_URL_TTL_SECONDS || '300', 10),

  FACE_MATCH_ENABLED: process.env.FACE_MATCH_ENABLED !== 'false',
  FACE_MATCH_THRESHOLD: parseFloat(process.env.FACE_MATCH_THRESHOLD || '0.5'),
} as const;

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
