import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
export declare const emailSchema: z.ZodString;
export declare const otpCodeSchema: z.ZodString;
export declare const samplesSchema: z.ZodString;
export declare const messageSchema: z.ZodString;
export declare const handleSchema: z.ZodString;
export declare const validate: (schema: z.ZodSchema, field?: string) => (req: Request, res: Response, next: NextFunction) => Response<any, Record<string, any>> | undefined;
export declare const sanitizeInput: (req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=validation.d.ts.map