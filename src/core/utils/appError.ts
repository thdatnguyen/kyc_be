export class AppError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(message: string, statusCode = 500, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError(message, 400, details);
export const unauthorized = (message = 'Authentication required') => new AppError(message, 401);
export const forbidden = (message = 'Access denied') => new AppError(message, 403);
export const notFound = (message = 'Resource not found') => new AppError(message, 404);
export const conflict = (message: string) => new AppError(message, 409);
