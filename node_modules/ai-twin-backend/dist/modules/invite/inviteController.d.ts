import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth';
export declare const getMyReferralCode: (req: AuthenticatedRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getMyReferrals: (req: AuthenticatedRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const acceptInvite: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const processInviteAcceptance: (req: AuthenticatedRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=inviteController.d.ts.map