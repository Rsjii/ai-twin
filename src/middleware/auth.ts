import { Request, Response, NextFunction } from 'express';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    handle?: string;
  };
}

export const requireAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.session?.userId) {
    return res.redirect('/login');
  }
  
  req.user = {
    id: req.session.userId,
    email: req.session.userEmail,
    handle: req.session.userHandle,
  };
  
  next();
};

export const optionalAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (req.session?.userId) {
    req.user = {
      id: req.session.userId,
      email: req.session.userEmail,
      handle: req.session.userHandle,
    };
  }
  
  next();
};
