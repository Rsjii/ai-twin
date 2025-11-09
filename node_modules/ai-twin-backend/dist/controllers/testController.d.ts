import { Request, Response } from 'express';
export declare const testRoute: (_req: Request, res: Response) => void;
export declare const testSession: (req: Request, res: Response) => void;
export declare const testDatabase: (_req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const testAuth: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const testOTP: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const basicTest: (_req: Request, res: Response) => void;
export declare const testProfile: (req: any, res: Response) => Promise<void | Response<any, Record<string, any>>>;
//# sourceMappingURL=testController.d.ts.map