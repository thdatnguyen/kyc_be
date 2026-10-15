import { Request, Response, NextFunction } from 'express';
import { Role } from '@core/types';
import { forbidden, unauthorized } from '@core/utils/appError';

export function requireRole(allowedRoles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(unauthorized('Authentication required'));
    }

    if (!allowedRoles.includes(req.user.role as Role)) {
      return next(forbidden(`Access denied. Required roles: ${allowedRoles.join(', ')}`));
    }

    next();
  };
}
