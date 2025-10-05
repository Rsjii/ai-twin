import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

// Input validation schemas
export const emailSchema = z.string().email('Invalid email format');
export const otpCodeSchema = z.string().length(6, 'OTP must be 6 digits').regex(/^\d{6}$/, 'OTP must contain only numbers');
export const samplesSchema = z.string().min(100, 'At least 100 characters required').max(3000, 'Maximum 3000 characters allowed');
export const messageSchema = z.string().min(1, 'Message cannot be empty').max(300, 'Message too long (max 300 characters)');
export const handleSchema = z.string().min(3, 'Handle must be at least 3 characters').max(20, 'Handle too long').regex(/^[a-zA-Z0-9_-]+$/, 'Handle can only contain letters, numbers, hyphens, and underscores');

// Validation middleware factory
export const validate = (schema: z.ZodSchema, field: string = 'body') => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = field === 'body' ? req.body : req.params;
      schema.parse(data[field === 'body' ? Object.keys(data)[0] : field]);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        });
      }
      next(error);
    }
  };
};

// Sanitization middleware
export const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
  const sanitize = (obj: any): any => {
    if (typeof obj === 'string') {
      return obj.trim().replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    }
    if (typeof obj === 'object' && obj !== null) {
      const sanitized: any = {};
      for (const key in obj) {
        sanitized[key] = sanitize(obj[key]);
      }
      return sanitized;
    }
    return obj;
  };
  
  req.body = sanitize(req.body);
  req.query = sanitize(req.query);
  req.params = sanitize(req.params);
  
  next();
};
