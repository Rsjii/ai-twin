import { Request, Response } from 'express';
export declare const likeTwin: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const unlikeTwin: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const followTwin: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const unfollowTwin: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getTwinStats: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getUserLikedTwins: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getUserFollowedTwins: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const toggleLike: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const toggleFollow: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=socialController.d.ts.map