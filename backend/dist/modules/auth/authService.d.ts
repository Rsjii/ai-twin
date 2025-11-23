export declare class EmailService {
    private transporter;
    constructor();
    sendOTP(email: string, code: string): Promise<boolean>;
}
export declare const generateOTP: (length?: number) => string;
export declare const hashOTP: (otp: string) => Promise<string>;
export declare const verifyOTP: (otp: string, hash: string) => Promise<boolean>;
export declare const hashPassword: (password: string) => Promise<string>;
export declare const verifyPassword: (password: string, hash: string) => Promise<boolean>;
export declare const generateProfileToken: (userId: string, handle: string) => string;
export declare const verifyProfileToken: (token: string) => {
    userId: string;
    handle: string;
} | null;
export declare const generateInviteCode: () => string;
//# sourceMappingURL=authService.d.ts.map