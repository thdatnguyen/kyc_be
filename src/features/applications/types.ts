export const DOCUMENT_TYPES = ['passport', 'national_id', 'driving_licence'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const APPLICATION_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'NEEDS_REVIEW',
  'APPROVED',
  'REJECTED',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const VERIFICATION_RESULTS = ['APPROVED', 'REJECTED', 'NEEDS_REVIEW'] as const;
export type VerificationResult = (typeof VERIFICATION_RESULTS)[number];

export interface PersonalDetails {
  fullName: string;
  dateOfBirth: string; // YYYY-MM-DD
  nationality: string;
  address?: string;
  phone?: string;
}

export interface DocumentInfo {
  type: DocumentType;
  documentNumber: string;
  fullName: string;
  dateOfBirth: string; // YYYY-MM-DD
  expiryDate?: string; // YYYY-MM-DD (optional for national_id)
  imagePublicId: string;
}

export interface SelfieInfo {
  imagePublicId: string;
  liveness?: {
    passed: boolean;
    method: string;
  };
}

export interface Draft {
  personalDetails?: PersonalDetails;
  document?: DocumentInfo;
  selfie?: SelfieInfo;
}

// The complete, strictly-validated draft used at the submit/verification boundary.
export interface FullDraft {
  personalDetails: PersonalDetails;
  document: DocumentInfo;
  selfie: SelfieInfo;
}

export interface CheckResult {
  name: string;
  passed: boolean;
  message?: string;
}

export interface FaceMatchResult {
  modelLoaded: boolean;
  matched?: boolean;
  similarity?: number;
  error?: string;
}

export interface VerificationOutcome {
  result: VerificationResult;
  checks: CheckResult[];
  faceMatch: FaceMatchResult;
}

export const STEPS = {
  PERSONAL_DETAILS: 0,
  DOCUMENT: 1,
  SELFIE: 2,
  REVIEW: 3,
} as const;
