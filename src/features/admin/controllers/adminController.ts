import { Request, Response, NextFunction } from 'express';
import * as adminService from '@features/admin/services/adminService';
import { sendSuccess } from '@core/utils/responseFormatter';

export async function listPending(req: Request, res: Response, next: NextFunction) {
  try {
    const { skip, top } = req.query as unknown as { skip: number; top: number };
    const result = await adminService.listPendingReviews(skip, top);
    return sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
}

export async function getDetails(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await adminService.getReviewDetails(req.params.id);
    return sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
}

export async function review(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await adminService.reviewSubmission(
      req.params.id,
      req.user!.userId,
      req.body.decision,
      req.body.reasons,
    );
    return sendSuccess(res, result, 200, 'Review recorded');
  } catch (error) {
    next(error);
  }
}
