import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';

type ValidationRule = {
  field: string;
  required?: boolean;
  type?: 'string' | 'number' | 'boolean' | 'array';
  minLength?: number;
  maxLength?: number;
};

function validateBody(rules: ValidationRule[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const errors: string[] = [];

    for (const rule of rules) {
      const value = req.body[rule.field];

      if (rule.required && (value === undefined || value === null || value === '')) {
        errors.push(`${rule.field} is required`);
        continue;
      }

      if (value === undefined || value === null) continue;

      if (rule.type === 'array' && !Array.isArray(value)) {
        errors.push(`${rule.field} must be an array`);
      } else if (rule.type && rule.type !== 'array' && typeof value !== rule.type) {
        errors.push(`${rule.field} must be a ${rule.type}`);
      }

      if (rule.minLength && typeof value === 'string' && value.length < rule.minLength) {
        errors.push(`${rule.field} must be at least ${rule.minLength} characters`);
      }

      if (rule.maxLength && typeof value === 'string' && value.length > rule.maxLength) {
        errors.push(`${rule.field} must be at most ${rule.maxLength} characters`);
      }
    }

    if (errors.length > 0) {
      throw new AppError(400, errors.join('; '));
    }

    next();
  };
}

export const validateCreateNote = validateBody([
  { field: 'title', required: true, type: 'string', minLength: 1, maxLength: 200 },
  { field: 'content', required: true, type: 'string', minLength: 1 },
  { field: 'tags', type: 'array' },
]);

export const validateUpdateNote = validateBody([
  { field: 'title', type: 'string', maxLength: 200 },
  { field: 'content', type: 'string' },
  { field: 'tags', type: 'array' },
  { field: 'status', type: 'string' },
]);
