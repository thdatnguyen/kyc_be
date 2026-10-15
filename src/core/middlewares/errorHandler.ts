import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import mongoose from 'mongoose';
import multer from 'multer';
import { log } from '@core/config/logger';
import { AppError } from '@core/utils/appError';
import { isProduction } from '@core/config/env';

type ErrorLike = Error & {
  statusCode?: number;
  keyValue?: Record<string, unknown>;
  code?: number;
  path?: string;
  value?: unknown;
};

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const e = err as ErrorLike;

  let statusCode = 500;
  let message = isProduction ? 'Internal server error' : e.message || 'Internal server error';
  let errorPayload: unknown;

  if (err instanceof ZodError) {
    statusCode = 400;
    message = 'Validation failed';
    errorPayload = err.errors.map((x) => ({ field: x.path.join('.'), message: x.message }));
  } else if (err instanceof JsonWebTokenError || err instanceof TokenExpiredError) {
    statusCode = 401;
    message = err instanceof TokenExpiredError ? 'Token has expired' : 'Invalid token';
  } else if (err instanceof mongoose.mongo.MongoServerError && e.code === 11000) {
    const field = Object.keys(e.keyValue || {})[0] || 'field';
    statusCode = 409;
    message = `Duplicate value for ${field}`;
  } else if (err instanceof mongoose.Error.CastError) {
    statusCode = 400;
    message = `Invalid ${err.path}: ${err.value}`;
  } else if (err instanceof multer.MulterError) {
    statusCode = 400;
    message = err.message;
  } else if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    errorPayload = err.details;
  } else if (e.statusCode) {
    statusCode = e.statusCode;
    message = e.message;
  }

  // Client errors (4xx) are expected — log as warn. Server errors (5xx) as error.
  const isServerError = statusCode >= 500;
  log(isServerError ? 'error' : 'warn', message, {
    method: req.method,
    path: req.originalUrl,
    statusCode,
    error: errorPayload,
    ...(isServerError ? { stack: e.stack } : {}),
  });

  return res.status(statusCode).json({
    success: false,
    message,
    requestId: req.id,
    ...(isProduction ? {} : { error: errorPayload ?? (isServerError ? e.stack : undefined) }),
  });
}
