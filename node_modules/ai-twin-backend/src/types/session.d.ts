import 'express-session';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    userEmail?: string;
    userHandle?: string;
    csrfToken?: string;
  }
}

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        handle?: string;
      };
    }
  }
}
