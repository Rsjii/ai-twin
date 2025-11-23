import { Request, Response, NextFunction } from 'express';
import { JWTPayload } from '../services/jwtService';
declare global {
    namespace Express {
        interface Request {
            user?: JWTPayload;
        }
    }
}
export declare const extractJWTFromCookie: (req: Request, res: Response, next: NextFunction) => void;
export declare const requireJWTFromCookie: (req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=jwtCookie.d.ts.map