import { randomUUID } from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import { requestContext } from '@core/utils/requestContext';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

/**
 * Assigns a correlation ID to every request (or honors an incoming
 * X-Request-Id), returns it in the response header, and binds request + client
 * context to AsyncLocalStorage so downstream logs are correlated and traceable.
 *
 * Client-sent headers (X-App-Version, X-Device-Id, X-Device-OS) are untrusted
 * hints — recorded for diagnostics/fraud signals, never used for authorization.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const requestId = (req.headers['x-request-id'] as string) || randomUUID();
  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);
  requestContext.run(
    {
      requestId,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      appVersion: req.get('x-app-version'),
      deviceId: req.get('x-device-id'),
      deviceOs: req.get('x-device-os'),
    },
    () => next(),
  );
}
