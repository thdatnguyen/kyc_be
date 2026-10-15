import { Router } from 'express';
import { authMiddleware } from '@core/middlewares/authMiddleware';
import { requireRole } from '@core/middlewares/rbacMiddleware';
import { validateResource } from '@core/middlewares/validateResource';
import { reviewSchema, idParamSchema, listQuerySchema } from '@features/admin/schemas/adminSchema';
import { listPending, getDetails, review } from '@features/admin/controllers/adminController';

const router = Router();

router.use(authMiddleware, requireRole(['Admin']));

/**
 * @swagger
 * /api/admin/reviews:
 *   get:
 *     summary: List submissions pending human review
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Pending reviews }
 */
router.get('/reviews', validateResource(listQuerySchema), listPending);

/**
 * @swagger
 * /api/admin/reviews/{id}:
 *   get:
 *     summary: Get a submission's details plus signed media URLs for review
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Review details }
 */
router.get('/reviews/:id', validateResource(idParamSchema), getDetails);

/**
 * @swagger
 * /api/admin/reviews/{id}:
 *   post:
 *     summary: Approve or reject a pending submission
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [decision]
 *             properties:
 *               decision: { type: string, enum: [approve, reject] }
 *               reasons: { type: array, items: { type: string } }
 *     responses:
 *       200: { description: Review recorded }
 */
router.post('/reviews/:id', validateResource(idParamSchema), validateResource(reviewSchema), review);

export default router;
