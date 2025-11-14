import { Response } from 'express';
import { generateCSRFToken } from '../middleware/csrf';
import { userQueries } from '../config/database';

/**
 * Help Center page
 */
export async function getHelpCenter(req: any, res: Response) {
  let user = null;
  if (req.user) {
    const fullUser = await userQueries.findByEmail(req.user.email);
    if (fullUser) {
      user = {
        id: fullUser.id,
        email: fullUser.email,
        handle: fullUser.handle,
        name: fullUser.name,
        profileImage: fullUser.profileImage,
      };
    }
  }
  
  res.render('help-center', {
    title: 'Help Center - AI Twin',
    user: user,
    csrfToken: res.locals['csrfToken'],
  });
}

export async function getContact(req: any, res: Response) {
  let user = null;
  if (req.user) {
    const fullUser = await userQueries.findByEmail(req.user.email);
    if (fullUser) {
      user = {
        id: fullUser.id,
        email: fullUser.email,
        handle: fullUser.handle,
        name: fullUser.name,
        profileImage: fullUser.profileImage,
      };
    }
  }
  
  res.render('contact', {
    title: 'Contact Us - AI Twin',
    user: user,
    csrfToken: res.locals['csrfToken'],
  });
}

export async function getPrivacy(req: any, res: Response) {
  let user = null;
  if (req.user) {
    const fullUser = await userQueries.findByEmail(req.user.email);
    if (fullUser) {
      user = {
        id: fullUser.id,
        email: fullUser.email,
        handle: fullUser.handle,
        name: fullUser.name,
        profileImage: fullUser.profileImage,
      };
    }
  }
  
  res.render('privacy', {
    title: 'Privacy Policy - AI Twin',
    user: user,
    csrfToken: res.locals['csrfToken'],
  });
}

export async function getTerms(req: any, res: Response) {
  let user = null;
  if (req.user) {
    const fullUser = await userQueries.findByEmail(req.user.email);
    if (fullUser) {
      user = {
        id: fullUser.id,
        email: fullUser.email,
        handle: fullUser.handle,
        name: fullUser.name,
        profileImage: fullUser.profileImage,
      };
    }
  }
  
  res.render('terms', {
    title: 'Terms of Service - AI Twin',
    user: user,
    csrfToken: res.locals['csrfToken'],
  });
}