import { Request, Response } from 'express';
export interface TwinPrivacySettings {
    allowPublicChat: boolean;
    showChatHistory: boolean;
    allowAnonymousChat: boolean;
    requireLogin: boolean;
    allowLikes: boolean;
    allowFollows: boolean;
    allowShares: boolean;
    moderateMessages: boolean;
    blockSpecificUsers: string[];
    allowDirectMessages: boolean;
}
export declare const updatePrivacySettings: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getPrivacySettings: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const blockUser: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const unblockUser: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const isUserBlocked: (req: Request, res: Response) => Promise<void>;
export declare const getPrivacyAnalytics: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=privacyController.d.ts.map