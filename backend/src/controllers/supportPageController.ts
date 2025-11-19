import { Response } from 'express';
import { userQueries, twinQueries } from '../config/database';

/**
 * Help Center page
 */
export async function getHelpCenter(req: any, res: Response) {
  let user = null;
  let hasTwins = false;
  let userTwinId = null;
  
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
      
      // ✅ ADD: Check if user has twins (like discover page)
      const userTwins = await twinQueries.findByUserId(fullUser.id);
      hasTwins = userTwins.length > 0;
      const userTwin = hasTwins ? userTwins[0] : null;
      userTwinId = userTwin && userTwin.id ? userTwin.id : null;
    }
  }
  
  res.render('help-center', {
    title: 'Help Center - AI Twin',
    user: user,
    hasTwins: hasTwins,  // ✅ ADD
    twinId: userTwinId,  // ✅ ADD
    csrfToken: res.locals['csrfToken'],
  });
}

export async function getContact(req: any, res: Response) {
  let user = null;
  let hasTwins = false;
  let userTwinId = null;
  
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
      
      // ✅ ADD: Check if user has twins (like discover page)
      const userTwins = await twinQueries.findByUserId(fullUser.id);
      hasTwins = userTwins.length > 0;
      const userTwin = hasTwins ? userTwins[0] : null;
      userTwinId = userTwin && userTwin.id ? userTwin.id : null;
    }
  }
  
  res.render('contact', {
    title: 'Contact Us - AI Twin',
    user: user,
    hasTwins: hasTwins,  // ✅ ADD
    twinId: userTwinId,  // ✅ ADD
    csrfToken: res.locals['csrfToken'],
  });
}

export async function getPrivacy(req: any, res: Response) {
  let user = null;
  let hasTwins = false;
  let userTwinId = null;
  
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
      
      // ✅ ADD: Check if user has twins (like discover page)
      const userTwins = await twinQueries.findByUserId(fullUser.id);
      hasTwins = userTwins.length > 0;
      const userTwin = hasTwins ? userTwins[0] : null;
      userTwinId = userTwin && userTwin.id ? userTwin.id : null;
    }
  }
  
  res.render('privacy', {
    title: 'Privacy Policy - AI Twin',
    user: user,
    hasTwins: hasTwins,  // ✅ ADD
    twinId: userTwinId,  // ✅ ADD
    csrfToken: res.locals['csrfToken'],
  });
}

export async function getTerms(req: any, res: Response) {
  let user = null;
  let hasTwins = false;
  let userTwinId = null;
  
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
      
      // ✅ ADD: Check if user has twins (like discover page)
      const userTwins = await twinQueries.findByUserId(fullUser.id);
      hasTwins = userTwins.length > 0;
      const userTwin = hasTwins ? userTwins[0] : null;
      userTwinId = userTwin && userTwin.id ? userTwin.id : null;
    }
  }
  
  res.render('terms', {
    title: 'Terms of Service - AI Twin',
    user: user,
    hasTwins: hasTwins,  // ✅ ADD
    twinId: userTwinId,  // ✅ ADD
    csrfToken: res.locals['csrfToken'],
  });
}