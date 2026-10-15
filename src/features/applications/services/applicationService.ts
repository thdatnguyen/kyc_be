import { Application } from '@features/applications/models/Application';
import { Submission } from '@features/applications/models/Submission';
import { verifySubmission } from '@features/verification/services/verificationService';
import { badRequest } from '@core/utils/appError';
import {
  personalDetailsSchema,
  documentSchema,
  selfieSchema,
  fullDraftSchema,
} from '@features/applications/schemas/applicationSchema';
import { FullDraft } from '@features/applications/types';

const STEP_SCHEMAS = {
  0: personalDetailsSchema,
  1: documentSchema,
  2: selfieSchema,
} as const;

const STEP_KEYS = {
  0: 'personalDetails',
  1: 'document',
  2: 'selfie',
} as const;

type Step = 0 | 1 | 2;

export async function getOrCreateApplication(userId: string) {
  let app = await Application.findOne({ applicant: userId });
  if (!app) {
    app = await Application.create({ applicant: userId, status: 'DRAFT', currentStep: 0, draft: {} });
  }
  return app;
}

export async function getMyApplication(userId: string) {
  const app = await getOrCreateApplication(userId);
  const latestSubmission = app.latestSubmission
    ? await Submission.findById(app.latestSubmission)
    : null;
  return {
    application: app.toJSON(),
    latestSubmission: latestSubmission ? latestSubmission.toJSON() : null,
  };
}

export async function saveDraftStep(userId: string, step: number, data: unknown) {
  if (!(step in STEP_SCHEMAS)) throw badRequest('Invalid step');
  const schema = STEP_SCHEMAS[step as Step];
  const parsed = schema.parse(data); // throws ZodError → handled by errorHandler

  const app = await getOrCreateApplication(userId);
  if (app.status !== 'DRAFT') {
    throw badRequest('Application is not editable in its current status');
  }

  app.draft = { ...(app.draft as object), [STEP_KEYS[step as Step]]: parsed };
  app.currentStep = Math.max(app.currentStep, step);
  await app.save();

  return app.toJSON();
}

export async function submitApplication(userId: string) {
  const app = await getOrCreateApplication(userId);
  if (app.status !== 'DRAFT') throw badRequest('Application already submitted');

  // Strictly validate the whole draft at the submit boundary.
  const full = fullDraftSchema.parse(app.draft) as unknown as FullDraft;

  const latest = await Submission.findOne({ application: app._id }).sort({ version: -1 });
  const version = (latest?.version ?? 0) + 1;

  const outcome = await verifySubmission(full);

  const submission = await Submission.create({
    application: app._id,
    version,
    personalDetails: full.personalDetails,
    document: full.document,
    selfie: full.selfie,
    result: outcome.result,
    checks: outcome.checks,
    faceMatch: outcome.faceMatch,
  });

  app.status = outcome.result;
  app.latestSubmission = submission._id;
  app.draft = {};
  await app.save();

  return { application: app.toJSON(), submission: submission.toJSON() };
}

export async function startResubmission(userId: string) {
  const app = await getOrCreateApplication(userId);
  if (app.status !== 'REJECTED') throw badRequest('Application is not in a rejected state');

  const latest = await Submission.findOne({ application: app._id }).sort({ version: -1 });
  if (!latest) throw badRequest('No previous submission to resubmit');

  // Pre-fill textual fields; images must be re-captured on resubmission.
  const { imagePublicId: _docImage, ...documentFields } = latest.document;

  app.draft = {
    personalDetails: latest.personalDetails,
    document: documentFields,
    selfie: undefined,
  };
  app.status = 'DRAFT';
  app.currentStep = 1;
  await app.save();

  return app.toJSON();
}

export async function listSubmissions(userId: string) {
  const app = await getOrCreateApplication(userId);
  const submissions = await Submission.find({ application: app._id }).sort({ version: -1 });
  return submissions.map((s) => s.toJSON());
}
