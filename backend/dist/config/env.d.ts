export declare const config: {
    databaseUrl: string;
    openaiApiKey: string;
    sessionSecret: string;
    mail: {
        from: string;
        smtp: {
            host: string;
            port: number;
            user: string;
            pass: string;
        };
    };
    google: {
        clientId: string;
        clientSecret: string;
        callbackURL: string;
    };
    nodeEnv: string;
    port: number;
    rateLimit: {
        windowMs: number;
        maxRequests: number;
    };
    otp: {
        expiryMinutes: number;
        codeLength: number;
    };
};
export declare const openai: {
    apiKey: string;
};
export default config;
//# sourceMappingURL=env.d.ts.map