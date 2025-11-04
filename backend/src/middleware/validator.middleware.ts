import type { Request, Response, NextFunction } from 'express';
import type Joi from 'joi';

export function validate(schema: Joi.ObjectSchema, property: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate((req as any)[property]);
    if (error) {
      res.status(400).json({ success: false, message: error.details?.[0]?.message || 'Validation error' });
      return;
    }
    (req as any)[property] = value;
    next();
  };
}


