import rateLimit, { Options } from 'express-rate-limit';
import { Request, Response, NextFunction, RequestHandler } from 'express';
import { isTest } from './env';

/**
 * 429 response in the standard API format (with correlation id). The library
 * also sets Retry-After and, with standardHeaders, the RateLimit-* headers.
 */
export function rateLimitHandler(req: Request, res: Response) {
  res.status(429).json({
    success: false,
    message: 'Too many requests, please try again later',
    requestId: req.id,
  });
}

/**
 * Test-aware limiter factory: a no-op in tests so suites don't share/thrash
 * buckets, and the real `express-rate-limit` middleware otherwise.
 *
 * Store note: the default is in-memory (per-process). For multiple Railway
 * replicas, swap in a shared store via `rate-limit-redis` keyed to REDIS_URL.
 */
export function createLimiter(options: Partial<Options> = {}): RequestHandler {
  if (isTest) {
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
    ...options,
  });
}

// Key authenticated requests on the user (not just IP) so limits follow the
// account even if the client rotates IPs, and shared mobile NATs don't
// throttle innocent users.
const keyByUser: Options['keyGenerator'] = (req) => req.user?.userId ?? req.ip ?? 'anon';

// --- Tiers -----------------------------------------------------------------

// General API traffic (per IP).
export const globalLimiter = createLimiter({
  windowMs: 60 * 1000,
  limit: 120,
});

// Login/register/refresh (per IP). Only FAILED attempts consume quota, so a
// brute-force attack is slowed without penalizing legitimate logins.
export const authLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
});

// Image uploads (per user) — large payloads.
export const uploadLimiter = createLimiter({
  windowMs: 60 * 1000,
  limit: 10,
  keyGenerator: keyByUser,
});

// Submit / resubmit (per user) — runs the expensive ML face-match.
export const submitLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  keyGenerator: keyByUser,
});
