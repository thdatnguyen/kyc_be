import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '@core/utils/jwtHelper';
import { BlacklistedToken } from '@features/auth/models/BlacklistedToken';
import { unauthorized } from '@core/utils/appError';
import { requestContext } from '@core/utils/requestContext';

// Augment Express Request with the authenticated user.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        role: string;
        jti: string;
        exp: number;
      };
    }
  }
}

export async function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw unauthorized('No token provided');
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyAccessToken(token);

    // Reject tokens blacklisted on logout.
    const isBlacklisted = await BlacklistedToken.exists({ jti: decoded.jti });
    if (isBlacklisted) {
      throw unauthorized('Token has been revoked');
    }

    req.user = {
      userId: decoded.userId,
      role: decoded.role,
      jti: decoded.jti,
      exp: decoded.exp ?? 0,
    };

    // Attach the authenticated identity to the request context for logging.
    const ctx = requestContext.getStore();
    if (ctx) {
      ctx.userId = decoded.userId;
      ctx.role = decoded.role;
    }

    next();
  } catch (error) {
    next(error);
  }
}
