import { FullDraft, VerificationOutcome } from '@features/applications/types';
import { runRules } from './rulesEngine';
import { compareFaces } from './faceMatch';
import { getStorage } from '@core/utils/storage';

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
 * server-authoritative face match and returns a single outcome. A commercial
 * vendor (Onfido/Jumio/SumSub) would replace this module.
 */
export async function verifySubmission(draft: FullDraft): Promise<VerificationOutcome> {
  const checks = runRules(draft);

  const hardFailures = checks.filter((c) => !c.passed && HARD_FAILURE_CHECKS.includes(c.name));
  if (hardFailures.length > 0) {
    return { result: 'REJECTED', checks, faceMatch: { modelLoaded: true } };
  }

  const storage = getStorage();
  const selfieBytes = await storage.read(draft.selfie.imagePublicId);
  const documentBytes = await storage.read(draft.document.imagePublicId);

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
}
