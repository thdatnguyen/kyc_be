import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '@app';
import { User } from '@features/auth/models/User';

const app = createApp();

// A minimal 1x1 PNG, enough for the upload endpoint (face match is disabled in tests).
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

async function createUser(email: string, role: 'Admin' | 'Applicant') {
  const hash = await bcrypt.hash('password123', 10);
  return User.create({ email, password: hash, role });
}

async function tokenFor(email: string): Promise<string> {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password: 'password123' });
  return res.body.data.token as string;
}

describe('Application KYC flow', () => {
  it('runs the full flow: personal details → document → selfie → submit', async () => {
    await createUser('app@test.com', 'Applicant');
    const token = await tokenFor('app@test.com');

    // Personal details
    await request(app)
      .post('/api/applications/me/step')
      .set('Authorization', `Bearer ${token}`)
      .send({ step: 0, data: { fullName: 'Jane Doe', dateOfBirth: '1990-01-01', nationality: 'US' } })
      .expect(200);

    // Upload document image
    const docUpload = await request(app)
      .post('/api/upload')
      .set('Authorization', `Bearer ${token}`)
      .field('kind', 'document')
      .attach('image', PNG, { filename: 'doc.png', contentType: 'image/png' })
      .expect(201);
    expect(docUpload.body.data.publicId).toBeDefined();

    // Document step
    await request(app)
      .post('/api/applications/me/step')
      .set('Authorization', `Bearer ${token}`)
      .send({
        step: 1,
        data: {
          type: 'passport',
          documentNumber: 'AB123456',
          fullName: 'Jane Doe',
          dateOfBirth: '1990-01-01',
          expiryDate: '2030-01-01',
          imagePublicId: docUpload.body.data.publicId,
        },
      })
      .expect(200);

    // Upload selfie
    const selfieUpload = await request(app)
      .post('/api/upload')
      .set('Authorization', `Bearer ${token}`)
      .field('kind', 'selfie')
      .attach('image', PNG, { filename: 'selfie.png', contentType: 'image/png' })
      .expect(201);

    // Selfie step
    await request(app)
      .post('/api/applications/me/step')
      .set('Authorization', `Bearer ${token}`)
      .send({
        step: 2,
        data: { imagePublicId: selfieUpload.body.data.publicId, liveness: { passed: true, method: 'blink' } },
      })
      .expect(200);

    // Submit → face match disabled in tests → NEEDS_REVIEW
    const submitRes = await request(app)
      .post('/api/applications/me/submit')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(submitRes.body.data.submission.result).toBe('NEEDS_REVIEW');
    expect(submitRes.body.data.submission.version).toBe(1);
    expect(submitRes.body.data.application.status).toBe('NEEDS_REVIEW');
  });

  it('allows an Admin to review and approve a pending submission', async () => {
    await createUser('admin@test.com', 'Admin');
    await createUser('app@test.com', 'Applicant');

    const adminToken = await tokenFor('admin@test.com');
    const appToken = await tokenFor('app@test.com');

    // Drive the applicant to a NEEDS_REVIEW submission quickly.
    await request(app)
      .post('/api/applications/me/step')
      .set('Authorization', `Bearer ${appToken}`)
      .send({ step: 0, data: { fullName: 'Jane Doe', dateOfBirth: '1990-01-01', nationality: 'US' } })
      .expect(200);

    const docUpload = await request(app)
      .post('/api/upload')
      .set('Authorization', `Bearer ${appToken}`)
      .field('kind', 'document')
      .attach('image', PNG, { filename: 'doc.png', contentType: 'image/png' });

    await request(app)
      .post('/api/applications/me/step')
      .set('Authorization', `Bearer ${appToken}`)
      .send({
        step: 1,
        data: {
          type: 'passport',
          documentNumber: 'AB123456',
          fullName: 'Jane Doe',
          dateOfBirth: '1990-01-01',
          expiryDate: '2030-01-01',
          imagePublicId: docUpload.body.data.publicId,
        },
      });

    const selfieUpload = await request(app)
      .post('/api/upload')
      .set('Authorization', `Bearer ${appToken}`)
      .field('kind', 'selfie')
      .attach('image', PNG, { filename: 'selfie.png', contentType: 'image/png' });

    await request(app)
      .post('/api/applications/me/step')
      .set('Authorization', `Bearer ${appToken}`)
      .send({
        step: 2,
        data: { imagePublicId: selfieUpload.body.data.publicId, liveness: { passed: true, method: 'blink' } },
      });

    const submitRes = await request(app)
      .post('/api/applications/me/submit')
      .set('Authorization', `Bearer ${appToken}`)
      .expect(200);
    const submissionId = submitRes.body.data.submission.id;

    // Admin lists pending reviews
    const pending = await request(app)
      .get('/api/admin/reviews')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(pending.body.data.count).toBe(1);

    // Admin approves
    const review = await request(app)
      .post(`/api/admin/reviews/${submissionId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'approve' })
      .expect(200);
    expect(review.body.data.result).toBe('APPROVED');

    // Applicant sees APPROVED status
    const me = await request(app)
      .get('/api/applications/me')
      .set('Authorization', `Bearer ${appToken}`)
      .expect(200);
    expect(me.body.data.application.status).toBe('APPROVED');
  });
});
