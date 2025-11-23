import { Request, Response } from 'express';
export declare enum ModerationLevel {
    NONE = "none",
    BASIC = "basic",
    STRICT = "strict",
    MAXIMUM = "maximum"
}
export declare const moderateContent: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const reportContent: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getModerationStats: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare function getModerationSettings(twinId?: string): Promise<any>;
export declare function moderateContentSync(content: string, contentType?: string, userId?: string, twinId?: string): Promise<{
    isApproved: boolean;
    confidence: number;
    reasons: string[];
    suggestions: string[];
}>;
//# sourceMappingURL=moderationController.d.ts.map