import { Request, Response, NextFunction } from 'express';
export declare const generateCSRFToken: (req: Request, res: Response, next: NextFunction) => void;
export declare const validateCSRF: (req: Request, res: Response, next: NextFunction) => Response<any, Record<string, any>> | undefined;
//# sourceMappingURL=csrf.d.ts.map