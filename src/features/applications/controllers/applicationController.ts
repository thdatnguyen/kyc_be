import { Request, Response, NextFunction } from 'express';
import * as applicationService from '@features/applications/services/applicationService';
import { sendSuccess } from '@core/utils/responseFormatter';

export async function getMyApplication(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await applicationService.getMyApplication(req.user!.userId);
    return sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
}

export async function saveStep(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await applicationService.saveDraftStep(
      req.user!.userId,
      req.body.step,
      req.body.data,
    );
    return sendSuccess(res, result, 200, 'Draft saved');
  } catch (error) {
    next(error);
  }
}

export async function submit(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await applicationService.submitApplication(req.user!.userId);
    return sendSuccess(res, result, 200, 'Application submitted');
  } catch (error) {
    next(error);
  }
}

export async function resubmit(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await applicationService.startResubmission(req.user!.userId);
    return sendSuccess(res, result, 200, 'Resubmission started');
  } catch (error) {
    next(error);
  }
}

export async function listSubmissions(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await applicationService.listSubmissions(req.user!.userId);
    return sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
}
