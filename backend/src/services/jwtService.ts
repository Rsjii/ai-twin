import jwt from 'jsonwebtoken';
import { logger } from '../config/logger';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const JWT_EXPIRES_IN = '7d';

export interface JWTPayload {
  userId: string;
  email: string;
  handle: string;
  iat?: number;
  exp?: number;
}

export const generateJWT = (payload: Omit<JWTPayload, 'iat' | 'exp'>): string => {
  try {
    const token = jwt.sign(payload, JWT_SECRET, { 
      expiresIn: JWT_EXPIRES_IN,
      issuer: 'ai-twin-app'
    });
    logger.info(`JWT generated for user: ${payload.email}`);
    return token;
  } catch (error) {
    logger.error('JWT generation error:', error);
    throw new Error('Failed to generate JWT token');
  }
};

export const verifyJWT = (token: string): JWTPayload => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    logger.info(`JWT verified for user: ${decoded.email}`);
    return decoded;
  } catch (error) {
    logger.error('JWT verification error:', error);
    throw new Error('Invalid or expired JWT token');
  }
};

export const extractTokenFromHeader = (authHeader: string | undefined): string | null => {
  if (!authHeader) return null;
  
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }
  
  return parts[1];
};
