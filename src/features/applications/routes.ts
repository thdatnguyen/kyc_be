import { Router } from 'express';
import { authMiddleware } from '@core/middlewares/authMiddleware';
import { requireRole } from '@core/middlewares/rbacMiddleware';
import { validateResource } from '@core/middlewares/validateResource';
import { submitLimiter } from '@core/config/rateLimiter';
import { saveStepSchema } from '@features/applications/schemas/applicationSchema';
import {
  getMyApplication,
  saveStep,
  submit,
  resubmit,
  listSubmissions,
} from '@features/applications/controllers/applicationController';

const router = Router();

router.use(authMiddleware, requireRole(['Applicant']));

/**
 * @swagger
 * /api/applications/me:
 *   get:
 *     summary: Get the current applicant's application, draft, and latest submission
 *     tags: [Applications]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Application state }
 */
router.get('/me', getMyApplication);

/**
 * @swagger
 * /api/applications/me/step:
 *   post:
 *     summary: Save one step of the draft (0=personal, 1=document, 2=selfie)
 *     tags: [Applications]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [step, data]
 *             properties:
 *               step: { type: integer }
 *               data: { type: object }
 *     responses:
 *       200: { description: Draft saved }
 */
router.post('/me/step', validateResource(saveStepSchema), saveStep);

/**
 * @swagger
 * /api/applications/me/submit:
 *   post:
 *     summary: Submit the draft for verification (runs rules + face match)
 *     tags: [Applications]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Submission and verification result }
 */
router.post('/me/submit', submitLimiter, submit);

/**
 * @swagger
 * /api/applications/me/resubmit:
 *   post:
 *     summary: Start a resubmission after a rejection (pre-fills draft)
 *     tags: [Applications]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Draft pre-filled for resubmission }
 */
router.post('/me/resubmit', resubmit);

/**
 * @swagger
 * /api/applications/me/submissions:
 *   get:
 *     summary: List all submission versions (audit history)
 *     tags: [Applications]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Submission history }
 */
router.get('/me/submissions', listSubmissions);

export default router;
