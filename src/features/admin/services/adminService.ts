import mongoose from 'mongoose';
import { Submission } from '@features/applications/models/Submission';
import { Application } from '@features/applications/models/Application';
import { badRequest, notFound } from '@core/utils/appError';
import { getStorage } from '@core/utils/storage';

export async function listPendingReviews(skip = 0, top = 20) {
  const filter = { result: 'NEEDS_REVIEW', 'adminReview.decision': { $exists: false } };
  const [submissions, count] = await Promise.all([
    Submission.find(filter).sort({ createdAt: 1 }).skip(skip).limit(top).populate('application'),
    Submission.countDocuments(filter),
  ]);
  return { submissions: submissions.map((s) => s.toJSON()), count };
}

export async function getReviewDetails(submissionId: string) {
  const submission = await Submission.findById(submissionId);
  if (!submission) throw notFound('Submission not found');

  const storage = getStorage();
  // A document may hold multiple images (National ID front + back), stored as a
  // comma-separated list of publicIds.
  const documentIds = submission.document.imagePublicId
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const documentUrls = await Promise.all(documentIds.map((id) => storage.getSignedUrl(id)));
  const selfieUrl = await storage.getSignedUrl(submission.selfie.imagePublicId);

  return { submission: submission.toJSON(), media: { documentUrls, selfieUrl } };
}

export async function reviewSubmission(
  submissionId: string,
  adminId: string,
  decision: 'approve' | 'reject',
  reasons: string[] = [],
) {
  const submission = await Submission.findById(submissionId);
  if (!submission) throw notFound('Submission not found');
  if (submission.result !== 'NEEDS_REVIEW') throw badRequest('Submission is not pending review');
  if (decision === 'reject' && reasons.length === 0) {
    throw badRequest('Rejection requires at least one reason');
  }

  submission.result = decision === 'approve' ? 'APPROVED' : 'REJECTED';
  submission.adminReview = {
    reviewedBy: new mongoose.Types.ObjectId(adminId),
    decision,
    reasons,
    decidedAt: new Date(),
  };
  await submission.save();

  await Application.updateOne(
    { _id: submission.application },
    { status: submission.result, latestSubmission: submission._id },
  );

  return submission.toJSON();
}
