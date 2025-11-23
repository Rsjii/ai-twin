import { Response, NextFunction } from 'express';
export declare const getLongTermMemories: (req: any, res: Response, next: NextFunction) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const addLongTermMemory: (req: any, res: Response, next: NextFunction) => Promise<void>;
export declare const updateLongTermMemory: (req: any, res: Response, next: NextFunction) => Promise<void>;
export declare const deleteLongTermMemory: (req: any, res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=longTermMemoryController.d.ts.map