import { FullDraft, VerificationOutcome } from '@features/applications/types';
import { runRules } from './rulesEngine';
import { compareFaces } from './faceMatch';
import { getStorage } from '@core/utils/storage';
import { logger } from '@core/config/logger';

// Deterministic rules that, when failed, produce an automatic REJECTION.
const HARD_FAILURE_CHECKS = [
  'documentType',
  'documentExpiry',
  'dateOfBirth',
  'nameConsistency',
  'dobConsistency',
  'documentNumber',
];

/**
 * The VerificationProvider boundary. Runs the rules engine + the
 * server-authoritative face match and returns a single outcome.
 */
export async function verifySubmission(draft: FullDraft): Promise<VerificationOutcome> {
  const checks = runRules(draft);

  const hardFailures = checks.filter((c) => !c.passed && HARD_FAILURE_CHECKS.includes(c.name));
  if (hardFailures.length > 0) {
    return { result: 'REJECTED', checks, faceMatch: { modelLoaded: true } };
  }

  try {
    const storage = getStorage();
    const primaryDocPublicId = draft.document.imagePublicId.split(',')[0].trim();
    const selfieBytes = await storage.read(draft.selfie.imagePublicId);
    const documentBytes = await storage.read(primaryDocPublicId);

    const faceMatch = await compareFaces(selfieBytes, documentBytes);
    checks.push({
      name: 'faceMatch',
      passed: faceMatch.matched === true,
      message:
        faceMatch.matched === true
          ? undefined
          : faceMatch.error || 'Face does not match the identity document',
    });

    // ML unavailable / no face detected → human review, never a silent verdict.
    if (!faceMatch.modelLoaded || faceMatch.error || faceMatch.matched === undefined) {
      return { result: 'NEEDS_REVIEW', checks, faceMatch };
    }

    // Face mismatch → reject (identity verification failed).
    if (faceMatch.matched === false) {
      return { result: 'REJECTED', checks, faceMatch };
    }

    // Liveness not confirmed → can't rule out a spoof → human review.
    if (draft.selfie.liveness?.passed !== true) {
      return { result: 'NEEDS_REVIEW', checks, faceMatch };
    }

    return { result: 'APPROVED', checks, faceMatch };
  } catch (err: any) {
    logger.error('Error during verification / face match:', err);
    const fallbackFaceMatch = {
      modelLoaded: false,
      error: err?.message || 'Face match execution error',
    };
    checks.push({
      name: 'faceMatch',
      passed: false,
      message: 'Face match evaluation error; flagged for admin review',
    });
    return { result: 'NEEDS_REVIEW', checks, faceMatch: fallbackFaceMatch };
  }
}
