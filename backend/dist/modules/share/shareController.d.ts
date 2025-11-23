import { Request, Response } from 'express';
export declare const generateShareLink: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getShareAnalytics: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const trackShareClick: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getPopularSharePlatforms: (req: Request, res: Response) => Promise<void>;
export declare const generateQRCode: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getShareableContent: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=shareController.d.ts.map