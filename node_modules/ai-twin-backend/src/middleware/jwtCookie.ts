import { Request, Response, NextFunction } from 'express';
import { verifyJWT, JWTPayload } from '../services/jwtService';
import { logger } from '../config/logger';

// Extend Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

export const extractJWTFromCookie = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Try to get JWT from cookie first
    const tokenFromCookie = req.cookies?.['jwtToken'];
    
    if (tokenFromCookie) {
      try {
        const decoded = verifyJWT(tokenFromCookie);
        // Map JWT payload to expected user structure
        req.user = {
          userId: decoded.userId,
          email: decoded.email,
          handle: decoded.handle,
          id: decoded.userId // Add id field for compatibility
        };
        logger.info(`JWT extracted from cookie for user: ${decoded.email}`);
        return next();
      } catch (error) {
        logger.warn('Invalid JWT token in cookie:', error);
        // Clear invalid cookie
        res.clearCookie('jwtToken');
      }
    }
    
    // If no valid JWT found, continue without user
    next();
  } catch (error) {
    logger.error('JWT cookie extraction error:', error);
    next();
  }
};

export const requireJWTFromCookie = (req: Request, res: Response, next: NextFunction) => {
  try {  
    // Try to get JWT from cookie first
    const tokenFromCookie = req.cookies?.['jwtToken'];
    
    if (!tokenFromCookie) {
      logger.warn('No JWT token found in cookie');
      return res.redirect('/auth');
    }
    
    try {
      const decoded = verifyJWT(tokenFromCookie);
      // Map JWT payload to expected user structure
      req.user = {
        userId: decoded.userId,
        email: decoded.email,
        handle: decoded.handle,
        id: decoded.userId // Add id field for compatibility
      };
      logger.info(`JWT verified from cookie for user: ${decoded.email}`);
      next();
    } catch (error) {
      logger.warn('Invalid JWT token in cookie:', error);
      res.clearCookie('jwtToken');
      return res.redirect('/auth');
    }
  } catch (error) {
    logger.error('JWT cookie verification error:', error);
    return res.redirect('/auth');
  }
};
