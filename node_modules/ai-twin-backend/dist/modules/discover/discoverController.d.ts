import { Request, Response, NextFunction } from 'express';
export declare const getTrendingTwins: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const searchTwins: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const getRecommendedTwins: (req: Request, res: Response, next: NextFunction) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getRecentTwins: (req: Request, res: Response, next: NextFunction) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getMostLikedTwins: (req: Request, res: Response, next: NextFunction) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getMostFollowedTwins: (req: Request, res: Response, next: NextFunction) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getPopularTwins: (req: Request, res: Response, next: NextFunction) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getDiscoverFeed: (req: Request, res: Response, next: NextFunction) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=discoverController.d.ts.map