import request from 'supertest';
import { createApp } from '@app';

const app = createApp();

describe('Auth API', () => {
  it('registers the first user as Admin', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'admin@test.com', password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.role).toBe('Admin');
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
  });

  it('registers subsequent users as Applicant and rejects duplicates', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'admin@test.com', password: 'password123' });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'user@test.com', password: 'password123' });
    expect(res.body.data.user.role).toBe('Applicant');

    const dup = await request(app)
      .post('/api/auth/register')
      .send({ email: 'user@test.com', password: 'password123' });
    expect(dup.status).toBe(409);
  });

  it('logs in and rotates a refresh token', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'login@test.com', password: 'password123' });

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@test.com', password: 'password123' });
    expect(login.status).toBe(200);

    const refresh = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: login.body.data.refreshToken });
    expect(refresh.status).toBe(200);
    expect(refresh.body.data.token).toBeDefined();
  });

  it('rejects invalid credentials generically', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'bad@test.com', password: 'password123' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'bad@test.com', password: 'wrongpassword' });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password');
  });
});
