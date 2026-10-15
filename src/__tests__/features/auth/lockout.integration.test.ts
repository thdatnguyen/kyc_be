import request from 'supertest';
import { createApp } from '@app';

const app = createApp();

describe('Account lockout (credential-stuffing defense)', () => {
  it('locks an account after repeated failed logins, blocking even the correct password', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'lock@test.com', password: 'correct-pass-1' });

    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/auth/login')
        .send({ email: 'lock@test.com', password: 'wrong-pass-1' })
        .expect(401);
    }

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'lock@test.com', password: 'correct-pass-1' });
    expect(res.status).toBe(429);
    expect(res.body.message).toContain('Too many failed attempts');
  });

  it('locks unknown emails too — does not reveal account existence', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/auth/login')
        .send({ email: 'ghost@test.com', password: 'wrong-pass-1' })
        .expect(401);
    }

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ghost@test.com', password: 'whatever-pass-1' });
    expect(res.status).toBe(429);
  });

  it('resets the failed-attempt counter on successful login', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'reset@test.com', password: 'correct-pass-1' });

    for (let i = 0; i < 4; i++) {
      await request(app)
        .post('/api/auth/login')
        .send({ email: 'reset@test.com', password: 'wrong-pass-1' })
        .expect(401);
    }

    // 4 < threshold, so the correct password still works and resets the counter.
    const ok = await request(app)
      .post('/api/auth/login')
      .send({ email: 'reset@test.com', password: 'correct-pass-1' })
      .expect(200);
    expect(ok.body.data.token).toBeDefined();

    // Counter was reset, so a fresh failure is allowed (not locked).
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'reset@test.com', password: 'wrong-pass-1' })
      .expect(401);
  });
});
