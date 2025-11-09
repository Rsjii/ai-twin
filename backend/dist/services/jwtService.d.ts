export interface JWTPayload {
    userId: string;
    email: string;
    handle: string;
    id?: string;
    iat?: number;
    exp?: number;
}
export declare const generateJWT: (payload: Omit<JWTPayload, "iat" | "exp">) => string;
export declare const verifyJWT: (token: string) => JWTPayload;
export declare const extractTokenFromHeader: (authHeader: string | undefined) => string | null;
//# sourceMappingURL=jwtService.d.ts.map