import { FullDraft, CheckResult, DOCUMENT_TYPES } from '@features/applications/types';

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z]/g, '');
}

function ageInYears(dateStr: string, now = new Date()): number {
  const dob = new Date(`${dateStr}T00:00:00`);
  if (isNaN(dob.getTime())) return NaN;
  return (now.getTime() - dob.getTime()) / (365.25 * 24 * 3600 * 1000);
}

const MIN_AGE = 16;

/**
 * Deterministic, server-side checks. These are the objective, non-ML rules that
 * decide REJECTED cases. The ML face match is layered on top by the
 * verification service.
 */
export function runRules(draft: FullDraft): CheckResult[] {
  const checks: CheckResult[] = [];
  const { personalDetails, document, selfie } = draft;
  const now = new Date();

  // Document type validity.
  checks.push({
    name: 'documentType',
    passed: DOCUMENT_TYPES.includes(document.type),
    message: DOCUMENT_TYPES.includes(document.type) ? undefined : 'Unknown document type',
  });

  // Document expiry.
  if (document.expiryDate) {
    const expired = new Date(`${document.expiryDate}T23:59:59`).getTime() < now.getTime();
    checks.push({
      name: 'documentExpiry',
      passed: !expired,
      message: expired ? 'Document has expired' : undefined,
    });
  } else {
    checks.push({ name: 'documentExpiry', passed: true, message: 'No expiry date provided' });
  }

  // Date of birth: valid, not in the future, at least MIN_AGE.
  const age = ageInYears(document.dateOfBirth, now);
  const dobValid = !isNaN(age) && age >= MIN_AGE && new Date(`${document.dateOfBirth}T00:00:00`) <= now;
  checks.push({
    name: 'dateOfBirth',
    passed: dobValid,
    message: dobValid ? undefined : `Date of birth invalid or under ${MIN_AGE}`,
  });

  // Name on the document must match personal details.
  const nameMatches = normalizeName(personalDetails.fullName) === normalizeName(document.fullName);
  checks.push({
    name: 'nameConsistency',
    passed: nameMatches,
    message: nameMatches ? undefined : 'Name on document does not match personal details',
  });

  // Date of birth on the document must match personal details.
  const dobMatches = personalDetails.dateOfBirth === document.dateOfBirth;
  checks.push({
    name: 'dobConsistency',
    passed: dobMatches,
    message: dobMatches ? undefined : 'Date of birth on document does not match personal details',
  });

  // Document number basic format.
  const numValid = /^[A-Za-z0-9]{5,20}$/.test(document.documentNumber);
  checks.push({
    name: 'documentNumber',
    passed: numValid,
    message: numValid ? undefined : 'Invalid document number format',
  });

  // Selfie present.
  checks.push({
    name: 'selfiePresent',
    passed: Boolean(selfie.imagePublicId),
    message: selfie.imagePublicId ? undefined : 'Selfie is missing',
  });

  // Liveness hint (client-provided, recorded not trusted).
  checks.push({
    name: 'liveness',
    passed: selfie.liveness?.passed === true,
    message: selfie.liveness?.passed ? undefined : 'Liveness not confirmed',
  });

  return checks;
}
