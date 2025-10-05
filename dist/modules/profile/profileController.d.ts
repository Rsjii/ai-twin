import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth';
export declare const updateHandle: (req: AuthenticatedRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getPublicProfile: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const generateProfileLink: (req: AuthenticatedRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const logProfileShare: (req: AuthenticatedRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=profileController.d.ts.map