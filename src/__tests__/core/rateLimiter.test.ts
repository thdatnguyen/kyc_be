import express from 'express';
import request from 'supertest';
import rateLimit from 'express-rate-limit';
import { rateLimitHandler } from '@core/config/rateLimiter';

// Use the real express-rate-limit directly (createLimiter is a test no-op) to
// exercise the 429 behavior + our standard handler.
const app = express();
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 2,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
  }),
);
app.get('/x', (_req, res) => res.json({ ok: true }));

describe('rate limiting', () => {
  it('returns 429 in the standard format after exceeding the limit', async () => {
    await request(app).get('/x').expect(200);
    await request(app).get('/x').expect(200);

    const res = await request(app).get('/x').expect(429);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('Too many requests');
    expect(res.headers['retry-after']).toBeDefined();
    expect(res.headers['ratelimit-limit']).toBeDefined();
  });
});
