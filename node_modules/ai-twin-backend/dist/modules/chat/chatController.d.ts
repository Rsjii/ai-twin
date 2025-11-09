import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth';
export declare const startChat: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const getChat: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const getUserChats: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const getChatHistory: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const getChatMessages: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const continueChat: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const generateDraft: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const sendMessage: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const handleUserMessage: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const updateChatMetadata: (chatId: string, message: string, sender: string) => Promise<void>;
export declare const deleteChat: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const createNewChat: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const updateChatTitle: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const generateChatTitle: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const getChatSummary: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=chatController.d.ts.map