import { Request, Response } from 'express';
export declare const loginStart: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const loginVerify: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const logout: (req: Request, res: Response) => void;
export declare const waitlistSignup: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=authController.d.ts.map