import { Request, Response } from 'express';
export declare const createTwin: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getUserTwins: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getTwinById: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=twinController.d.ts.map