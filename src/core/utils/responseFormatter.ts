import { Response } from 'express';
import { isProduction } from '@core/config/env';

interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  error?: unknown;
}

export function sendSuccess<T>(res: Response, data: T, statusCode = 200, message?: string) {
  const response: ApiResponse<T> = { success: true, data };
  if (message) response.message = message;
  return res.status(statusCode).json(response);
}

export function sendError(res: Response, message: string, statusCode = 500, error?: unknown) {
  const response: ApiResponse = { success: false, message };
  if (error !== undefined && !isProduction) response.error = error;
  return res.status(statusCode).json(response);
}
