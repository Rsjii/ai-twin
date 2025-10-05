import { Request, Response, NextFunction } from 'express';
import { JWTPayload } from '../services/jwtService';
declare global {
    namespace Express {
        interface Request {
            user?: JWTPayload;
        }
    }
}
export declare const authenticateJWT: (req: Request, res: Response, next: NextFunction) => Response<any, Record<string, any>> | undefined;
export declare const optionalJWT: (req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=jwtAuth.d.ts.map