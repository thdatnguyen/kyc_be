import request from 'supertest';
import { createApp } from '@app';

const app = createApp();

describe('Request correlation & error tracing', () => {
  it('returns an X-Request-Id header on success', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'a@test.com', password: 'password123' });
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('includes requestId in validation error responses (register fails before DB)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.requestId).toBeDefined();
    expect(res.headers['x-request-id']).toBe(res.body.requestId);
  });

  it('honors an incoming X-Request-Id header', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .set('x-request-id', 'my-trace-id')
      .send({ email: 'b@test.com', password: 'password123' });
    expect(res.headers['x-request-id']).toBe('my-trace-id');
  });

  it('returns a requestId for a failed login (401)', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'login@test.com', password: 'password123' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@test.com', password: 'wrongpassword' });
    expect(res.status).toBe(401);
    expect(res.body.requestId).toBeDefined();
  });
});
