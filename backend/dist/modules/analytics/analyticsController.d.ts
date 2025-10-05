import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth';
export declare const getMetricsSummary: (req: Request, res: Response) => Promise<void>;
export declare const getUserAnalytics: (req: AuthenticatedRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=analyticsController.d.ts.map