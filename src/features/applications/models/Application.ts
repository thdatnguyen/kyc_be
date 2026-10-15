import mongoose from 'mongoose';
import { APPLICATION_STATUSES, ApplicationStatus } from '@features/applications/types';

export interface ApplicationDoc {
  _id: mongoose.Types.ObjectId;
  applicant: mongoose.Types.ObjectId;
  status: ApplicationStatus;
  currentStep: number;
  draft: Record<string, unknown>;
  latestSubmission?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const applicationSchema = new mongoose.Schema<ApplicationDoc>(
  {
    applicant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    status: {
      type: String,
      enum: APPLICATION_STATUSES,
      default: 'DRAFT',
    },
    currentStep: { type: Number, default: 0 },
    // Draft is a flexible partial working state (validated strictly at submit).
    draft: { type: mongoose.Schema.Types.Mixed, default: {} },
    latestSubmission: { type: mongoose.Schema.Types.ObjectId, ref: 'Submission' },
  },
  { timestamps: true },
);

applicationSchema.set('toJSON', {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc, ret: any) => {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const Application = mongoose.model<ApplicationDoc>('Application', applicationSchema);
