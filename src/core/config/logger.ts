import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { env } from './env';
import { getRequestContext } from '@core/utils/requestContext';

const logDir = env.LOG_DIR || path.join(__dirname, '..', '..', '..', 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const isProduction = env.NODE_ENV === 'production';
const isTest = env.NODE_ENV === 'test';

const transports: winston.transport[] = [
  new winston.transports.File({
    filename: path.join(logDir, 'combined.log'),
    maxsize: 5 * 1024 * 1024,
    maxFiles: 5,
  }),
  new winston.transports.File({
    filename: path.join(logDir, 'error.log'),
    level: 'error',
    maxsize: 5 * 1024 * 1024,
    maxFiles: 5,
  }),
];

if (!isProduction && !isTest) {
  transports.push(
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
    }),
  );
}

export const logger = winston.createLogger({
  level: isProduction ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  transports,
});

type LogLevel = 'error' | 'warn' | 'info' | 'http' | 'verbose' | 'debug';

/**
 * Log with the current request's correlation context (requestId, userId)
 * merged in automatically. Use this from services/controllers so every line
 * is traceable back to the originating request.
 */
export function log(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  const ctx = getRequestContext();
  logger.log(level, message, {
    requestId: ctx?.requestId,
    userId: ctx?.userId,
    role: ctx?.role,
    ip: ctx?.ip,
    userAgent: ctx?.userAgent,
    appVersion: ctx?.appVersion,
    deviceId: ctx?.deviceId,
    deviceOs: ctx?.deviceOs,
    ...meta,
  });
}
