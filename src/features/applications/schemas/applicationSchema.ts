import { z } from 'zod';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

export const personalDetailsSchema = z.object({
  fullName: z
    .string()
    .min(2, 'Full name is required')
    .max(200)
    .transform((v) => v.trim()),
  dateOfBirth: dateString,
  nationality: z
    .string()
    .min(2, 'Nationality is required')
    .max(100)
    .transform((v) => v.trim()),
  address: z.string().max(500).optional(),
  phone: z.string().max(20).optional(),
});

export const documentSchema = z.object({
  type: z.enum(['passport', 'national_id', 'driving_licence']),
  documentNumber: z.string().min(5, 'Document number is too short').max(20),
  fullName: z
    .string()
    .min(2, 'Full name is required')
    .max(200)
    .transform((v) => v.trim()),
  dateOfBirth: dateString,
  expiryDate: dateString.optional(),
  imagePublicId: z.string().min(1, 'Document image is required'),
});

export const selfieSchema = z.object({
  imagePublicId: z.string().min(1, 'Selfie image is required'),
  liveness: z
    .object({
      passed: z.boolean(),
      method: z.string().min(1),
    })
    .optional(),
});

export const fullDraftSchema = z.object({
  personalDetails: personalDetailsSchema,
  document: documentSchema,
  selfie: selfieSchema,
});

// Wrapper for the "save a draft step" endpoint.
export const saveStepSchema = z.object({
  body: z.object({
    step: z.number().int().min(0).max(2),
    data: z.record(z.unknown()),
  }),
});
