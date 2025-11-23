import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth';
export declare const makeTwinPublic: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const makeTwinPrivate: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const updateTwinProfile: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const getPublicTwinProfile: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const getMyTwinProfile: (req: Request, res: Response, next: NextFunction) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getPublicChatPage: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=publicTwinController.d.ts.map