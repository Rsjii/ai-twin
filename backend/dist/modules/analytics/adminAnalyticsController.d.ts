import { Request, Response } from 'express';
export declare const requireAdminAuth: (req: Request, res: Response, next: Function) => Response<any, Record<string, any>> | undefined;
export declare const getAdminAnalytics: (req: Request, res: Response) => Promise<void>;
export declare const getAdminUserAnalytics: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getDetailedUserInfo: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const removeUser: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getTimeBasedAnalytics: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getUsersList: (req: Request, res: Response) => Promise<void>;
export declare const getDetailedMetrics: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getDetailedUsersPage: (req: Request, res: Response) => Promise<void>;
export declare const getDetailedTwinsPage: (req: Request, res: Response) => Promise<void>;
export declare const getDetailedChatsPage: (req: Request, res: Response) => Promise<void>;
export declare const getDetailedMessagesPage: (req: Request, res: Response) => Promise<void>;
export declare const getSystemHealth: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=adminAnalyticsController.d.ts.map