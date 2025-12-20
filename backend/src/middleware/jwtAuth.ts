import { Request, Response, NextFunction } from 'express';
import { verifyJWT, extractTokenFromHeader, JWTPayload } from '../services/jwtService';
import { logger } from '../config/logger';

export const authenticateJWT = (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const token = extractTokenFromHeader(authHeader);
    
    if (!token) {
      logger.warn('JWT authentication failed: No token provided');
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const decoded = verifyJWT(token);
    req.user = {
      id: decoded.userId,
      userId: decoded.userId,
      email: decoded.email,
      handle: decoded.handle,
    };
    
    logger.info(`JWT authentication successful for user: ${decoded.email}`);
    next();
  } catch (error) {
    logger.error('JWT authentication error:', error);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

export const optionalJWT = (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const token = extractTokenFromHeader(authHeader);
    
    if (token) {
      const decoded = verifyJWT(token);
      req.user = {
        id: decoded.userId,
        userId: decoded.userId,
        email: decoded.email,
        handle: decoded.handle,
      };
      logger.info(`Optional JWT authentication successful for user: ${decoded.email}`);
    }
    
    next();
  } catch (error) {
    // For optional auth, we don't fail if token is invalid
    logger.warn('Optional JWT authentication failed, continuing without user:', error);
    next();
  }
};
