import { Request, Response, NextFunction } from 'express';
import { authService } from '@features/auth/services/authService';
import { sendSuccess } from '@core/utils/responseFormatter';

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.register(req.body);
    return sendSuccess(res, result, 201, 'User registered successfully');
  } catch (error) {
    next(error);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.login(req.body);
    return sendSuccess(res, result, 200, 'Logged in successfully');
  } catch (error) {
    next(error);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.refresh(req.body.refreshToken);
    return sendSuccess(res, result, 200, 'Token refreshed');
  } catch (error) {
    next(error);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    await authService.logout({
      userId: req.user!.userId,
      jti: req.user!.jti,
      exp: req.user!.exp,
    });
    return sendSuccess(res, null, 200, 'Logged out successfully');
  } catch (error) {
    next(error);
  }
}
