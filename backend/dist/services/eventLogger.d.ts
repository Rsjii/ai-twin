export interface EventLogData {
    userId?: string | null;
    type: string;
    meta?: any;
}
export declare class EventLogger {
    static log(userId: string | null, type: string, meta?: any): Promise<void>;
    static logUserEvent(userId: string, type: string, meta?: any): Promise<void>;
    static logSystemEvent(type: string, meta?: any): Promise<void>;
    static getUserEvents(userId: string, limit?: number): Promise<any[]>;
    static getEventsByType(type: string, limit?: number): Promise<any[]>;
}
export declare const logEvent: typeof EventLogger.log;
export declare const logUserEvent: typeof EventLogger.logUserEvent;
export declare const logSystemEvent: typeof EventLogger.logSystemEvent;
//# sourceMappingURL=eventLogger.d.ts.map