import { Request, Response, NextFunction } from 'express';
import { ZodError, AnyZodObject } from 'zod';
import { badRequest } from '@core/utils/appError';

type SchemaMap = AnyZodObject & {
  shape: Partial<Record<'body' | 'query' | 'params', AnyZodObject>>;
};

/**
 * Accepts a Zod object shaped like `{ body?, query?, params? }` and validates
 * each present part of the request, coercing/transforming in place.
 */
export function validateResource(schemas: AnyZodObject) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const shape = (schemas as SchemaMap).shape;
      if (shape.body) req.body = shape.body.parse(req.body);
      if (shape.query) req.query = shape.query.parse(req.query) as never;
      if (shape.params) req.params = shape.params.parse(req.params) as never;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return next(
          badRequest(
            'Validation failed',
            error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
          ),
        );
      }
      next(error);
    }
  };
}
