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
    // Passport sets req.user as Express.User; augment it once, globally.
    interface User {
      id: string;
      userId?: string;
      email: string;
      handle?: string;
    }
  }
}
