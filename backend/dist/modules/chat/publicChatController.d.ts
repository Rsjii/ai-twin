import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth';
export declare const startPublicChat: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const sendPublicMessage: (req: Request, res: Response, next: NextFunction) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getPublicChatHistory: (req: Request, res: Response, next: NextFunction) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getPublicChatByTwin: (req: Request, res: Response, next: NextFunction) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getPublicChatsByTwin: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const createNewPublicChat: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const getUserPublicChats: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const deletePublicChat: (req: Request, res: Response, next: NextFunction) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const updatePublicChatTitle: (req: Request, res: Response, next: NextFunction) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=publicChatController.d.ts.map