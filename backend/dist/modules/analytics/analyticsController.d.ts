import { Request, Response } from 'express';
export declare const getMetricsSummary: (_req: Request, res: Response) => Promise<void>;
export declare const getTwinPerformance: (req: Request, res: Response) => Promise<void>;
export declare const debugUserData: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const createSampleData: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getUserAnalytics: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getTwinAnalytics: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getReferralStats: (req: any, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=analyticsController.d.ts.map