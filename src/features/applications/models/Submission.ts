import mongoose from 'mongoose';
import {
  DocumentInfo,
  PersonalDetails,
  SelfieInfo,
  CheckResult,
  FaceMatchResult,
  VerificationResult,
  VERIFICATION_RESULTS,
} from '@features/applications/types';

export interface SubmissionDoc {
  _id: mongoose.Types.ObjectId;
  application: mongoose.Types.ObjectId;
  version: number;
  personalDetails: PersonalDetails;
  document: DocumentInfo;
  selfie: SelfieInfo;
  result: VerificationResult;
  checks: CheckResult[];
  faceMatch: FaceMatchResult;
  adminReview?: {
    reviewedBy: mongoose.Types.ObjectId;
    decision: 'approve' | 'reject';
    reasons: string[];
    decidedAt: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

const submissionSchema = new mongoose.Schema<SubmissionDoc>(
  {
    application: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Application',
      required: true,
      index: true,
    },
    version: { type: Number, required: true },
    personalDetails: {
      fullName: { type: String, required: true },
      dateOfBirth: { type: String, required: true },
      nationality: { type: String, required: true },
      address: { type: String },
      phone: { type: String },
    },
    document: {
      type: { type: String, required: true },
      documentNumber: { type: String, required: true },
      fullName: { type: String, required: true },
      dateOfBirth: { type: String, required: true },
      expiryDate: { type: String },
      imagePublicId: { type: String, required: true },
    },
    selfie: {
      imagePublicId: { type: String, required: true },
      liveness: {
        passed: { type: Boolean },
        method: { type: String },
      },
    },
    result: { type: String, enum: VERIFICATION_RESULTS },
    checks: [
      {
        name: { type: String },
        passed: { type: Boolean },
        message: { type: String },
      },
    ],
    faceMatch: {
      modelLoaded: { type: Boolean },
      matched: { type: Boolean },
      similarity: { type: Number },
      error: { type: String },
    },
    adminReview: {
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      decision: { type: String, enum: ['approve', 'reject'] },
      reasons: [{ type: String }],
      decidedAt: { type: Date },
    },
  },
  { timestamps: true },
);

// Immutable snapshots: each version unique per application.
submissionSchema.index({ application: 1, version: 1 }, { unique: true });

submissionSchema.set('toJSON', {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc, ret: any) => {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const Submission = mongoose.model<SubmissionDoc>('Submission', submissionSchema);
