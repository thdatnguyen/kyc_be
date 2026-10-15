import { z } from 'zod';

export const reviewSchema = z.object({
  body: z.object({
    decision: z.enum(['approve', 'reject']),
    reasons: z.array(z.string().min(1)).optional(),
  }),
});

export const idParamSchema = z.object({
  params: z.object({
    id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id format'),
  }),
});

export const listQuerySchema = z.object({
  query: z.object({
    skip: z.coerce.number().int().min(0).default(0),
    top: z.coerce.number().int().min(1).max(100).default(20),
  }),
});
