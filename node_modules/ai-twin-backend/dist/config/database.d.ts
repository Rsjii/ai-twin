import { db } from './db';
export declare function initializeDatabase(): Promise<void>;
export declare function generateId(): string;
export declare const userQueries: {
    create: (email: string, handle?: string, passwordHash?: string) => Promise<any>;
    findByEmail: (email: string) => Promise<any>;
    findById: (id: string) => Promise<any>;
    updatePassword: (email: string, passwordHash: string) => Promise<any>;
    activateUser: (email: string) => Promise<any>;
    updateProfile: (email: string, name: string, handle: string, dob: string, phone: string, bio: string, profileImage?: string | null) => Promise<any>;
};
export declare const twinQueries: {
    create: (userId: string, styleVector: any, sampleReply?: string, instructions?: any) => Promise<any>;
    findByUserId: (userId: string) => Promise<any[]>;
    updateInstructions: (userId: string, instructions: any) => Promise<any>;
    updateStyleVector: (userId: string, styleVector: any) => Promise<any>;
    findById: (twinId: string) => Promise<any>;
};
export declare const chatQueries: {
    create: (userId: string, twinId: string) => Promise<any>;
    findByUserId: (userId: string) => Promise<any[]>;
};
export declare const messageQueries: {
    create: (chatId: string, sender: "human" | "twin", content: string, approved?: boolean) => Promise<any>;
    findByChatId: (chatId: string) => Promise<any[]>;
};
export { db };
export declare const otpQueries: {
    create: (email: string, codeHash: string, expiresAt: Date) => Promise<any>;
    findByEmail: (email: string) => Promise<any>;
    markAsUsed: (id: string) => Promise<any>;
};
//# sourceMappingURL=database.d.ts.map