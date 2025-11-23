import { Request, Response, NextFunction } from 'express';
export declare const submitResponseFeedback: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const getFeedbackStats: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const submitChatFeedback: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const regenerateResponse: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const getFeedbackAnalytics: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const getChatFeedbackStatus: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const adjustTone: (req: Request, res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=feedbackController.d.ts.map