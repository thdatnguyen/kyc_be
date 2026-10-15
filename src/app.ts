import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import { env, isProduction, isTest } from './core/config/env';
import { logger } from './core/config/logger';
import { errorHandler } from './core/middlewares/errorHandler';
import { requestIdMiddleware } from './core/middlewares/requestId';
import { swaggerSpec } from './core/config/swagger';
import { globalLimiter, authLimiter } from './core/config/rateLimiter';
import authRoutes from '@features/auth/routes';
import applicationRoutes from '@features/applications/routes';
import adminRoutes from '@features/admin/routes';
import { uploadRouter, mediaRouter } from '@features/upload/routes';

export function createApp() {
  const app = express();

  // Resolve the real client IP from X-Forwarded-For (behind Railway/Docker),
  // so req.ip, rate limiting, and IP logging are accurate.
  app.set('trust proxy', env.TRUST_PROXY);

  // 0. Correlation ID — available to every downstream middleware/log line.
  app.use(requestIdMiddleware);

  // 1. Security headers
  app.use(helmet());

  // 2. CORS — whitelist from env, support comma-separated origins
  const allowedOrigins = env.CORS_ORIGIN.split(',').map((o) => o.trim());
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
    }),
  );

  // 3. Body parsing (with size limits)
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // 4. Rate limiting (limiters are no-ops in test mode — see createLimiter)
  app.use('/api', globalLimiter);
  app.use('/api/auth', authLimiter);

  // 5. HTTP request logging (skip in test)
  if (!isTest) {
    morgan.token('id', (req) => (req as unknown as { id?: string }).id || '-');
    app.use(
      morgan(':id :remote-addr :method :url :status :response-time ms', {
        stream: { write: (message: string) => logger.info(message.trim()) },
      }),
    );
  }

  // 6. Health check (before auth)
  app.get('/api/health', (_req, res) => {
    res.json({ success: true, message: 'Server is up and running', timestamp: new Date().toISOString() });
  });

  // 7. Swagger docs
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get('/api-docs.json', (_req, res) => res.json(swaggerSpec));

  // 8. Feature routes
  app.use('/api/auth', authRoutes);
  app.use('/api/applications', applicationRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/upload', uploadRouter);
  app.use('/api/media', mediaRouter);

  // 9. 404 catch-all
  app.use((_req, res) => {
    res.status(404).json({ success: false, message: 'Route not found' });
  });

  // 10. Centralized error handler (must be last)
  app.use(errorHandler);

  return app;
}

export { isProduction };
