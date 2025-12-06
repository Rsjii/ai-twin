import { Response, NextFunction} from 'express';
import { db, userQueries } from '../config/database';
import { logger } from '../config/logger';
import { AppError, createError } from '../utils/errors';
import { ADMIN_EMAILS } from '../config/constants';
import { handleControllerError } from '../utils/errorHandler';
import { detokenizeId, tokenizeId } from '../utils/idTokenization';

/**
 * Analytics dashboard page - User analytics
 */
export async function getAnalytics(req: any, res: Response) {
  try {
    if (!req.user) {
      return res.redirect('/auth');
    }
    
    const fullUser = await userQueries.findByEmail(req.user.email);
    if (!fullUser) {
      return res.redirect('/auth');
    }
    
    const user = {
      id: fullUser.id,
      email: fullUser.email,
      handle: fullUser.handle,
      name: fullUser.name,
      profileImage: fullUser.profileImage,
    };

    //Get user's twin ID
    const twinResult = await db.query(
      'SELECT id FROM "Twin" WHERE "userId" = $1 LIMIT 1',
      [req.user.id]
    );
    const rawTwinId = twinResult.rows.length > 0 ? twinResult.rows[0].id : '';
    const userTwinId = rawTwinId ? tokenizeId(rawTwinId, 'twin') : null;
    
    res.render('analytics', {
      title: 'Analytics Dashboard - AI Twin',
      user: user,
      pathname: '/analytics',
      userTwinId: userTwinId,
      csrfToken: res.locals['csrfToken']
    });
  } catch (error) {
    logger.error('Analytics page error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id,
      path: req.path
    });

    handleControllerError(error, 'Failed to load analytics');
  }
}

/**
 * Admin Analytics dashboard page
 */
export async function getAdminAnalytics(req: any, res: Response) {
  try {
    if (!req.user || !req.user.email || !ADMIN_EMAILS.includes(req.user.email)) {
      return res.status(404).render('404', {
        title: 'Page Not Found',
      });
    }

    const fullUser = await userQueries.findByEmail(req.user.email);
    if (!fullUser) {
      return res.redirect('/auth');
    }

    res.render('admin-analytics', {
      title: 'Admin Analytics Dashboard - AI Twin',
      user: {
        id: fullUser.id,
        email: fullUser.email,
        handle: fullUser.handle,
        name: fullUser.name,
        profileImage: fullUser.profileImage
      },
      csrfToken: res.locals['csrfToken']
    });
  } catch (error) {
    logger.error('Admin analytics page error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id,
      path: req.path
    });
    
    handleControllerError(error, 'Failed to load admin analytics');
  }
}

/**
 * Admin Analytics detailed page
 */
export async function getAdminAnalyticsPage(req: any, res: Response) {
  try {
    if (!req.user || !req.user.email || !ADMIN_EMAILS.includes(req.user.email)) {
      return res.status(404).render('404', {
        title: 'Page Not Found',
      });
    }

    const { type } = req.params;
    const validTypes = ['users', 'twins', 'chats', 'messages'];
    
    if (!validTypes.includes(type)) {
      throw createError.notFound('Invalid page type');
    }

    const fullUser = await userQueries.findByEmail(req.user.email);
    if (!fullUser) {
      return res.redirect('/auth');
    }

    res.render(`admin-analytics-${type}`, {
      title: `Admin Analytics - ${type.charAt(0).toUpperCase() + type.slice(1)} - AI Twin`,
      user: {
        id: fullUser.id,
        email: fullUser.email,
        handle: fullUser.handle,
        name: fullUser.name,
        profileImage: fullUser.profileImage
      },
      pageType: type,
      csrfToken: res.locals['csrfToken']
    });
  } catch (error) {
    logger.error('Admin analytics page error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id,
      path: req.path
    });
    
    handleControllerError(error, 'Failed to load admin analytics page');
  }
}

/**
 * Event Explorer page
 */
export async function getEventExplorerPage(req: any, res: Response) {
  try {
    if (!req.user || !req.user.email || !ADMIN_EMAILS.includes(req.user.email)) {
      return res.status(404).render('404', {
        title: 'Page Not Found',
      });
    }

    const fullUser = await userQueries.findByEmail(req.user.email);
    if (!fullUser) {
      return res.redirect('/auth');
    }

    res.render('admin-analytics-events', {
      title: 'Admin Analytics - Events Explorer - AI Twin',
      user: {
        id: fullUser.id,
        email: fullUser.email,
        handle: fullUser.handle,
        name: fullUser.name,
        profileImage: fullUser.profileImage
      },
      csrfToken: res.locals['csrfToken']
    });
  } catch (error) {
    logger.error('Event explorer page error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id,
      path: req.path
    });
    
    handleControllerError(error, 'Failed to load event explorer page');
  }
}

/**
 * Activity Feed page
 */
export async function getActivityFeedPage(req: any, res: Response) {
  try {
    if (!req.user || !req.user.email || !ADMIN_EMAILS.includes(req.user.email)) {
      return res.status(404).render('404', {
        title: 'Page Not Found',
      });
    }

    const fullUser = await userQueries.findByEmail(req.user.email);
    if (!fullUser) {
      return res.redirect('/auth');
    }

    res.render('admin-analytics-activity', {
      title: 'Admin Analytics - Activity Feed - AI Twin',
      user: {
        id: fullUser.id,
        email: fullUser.email,
        handle: fullUser.handle,
        name: fullUser.name,
        profileImage: fullUser.profileImage
      },
      csrfToken: res.locals['csrfToken']
    });
  } catch (error) {
    logger.error('Activity feed page error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id,
      path: req.path
    });
    
    handleControllerError(error, 'Failed to load activity feed page');
  }
}


// Analytics details page (likers / followers / chatters)
export async function getAnalyticsDetails(req: any, res: Response, next: NextFunction) {
  try {
    const { type, twinId, page = 1, limit = 2, search = '' } = req.query;

    // 1) Auth check
    if (!req.user || !req.user.id) {
      return res.redirect('/auth');
    }

    // 2) Type validation (CRITICAL)
    const validTypes = ['likers', 'followers', 'chatters'];
    if (!type || !validTypes.includes(type as string)) {
      logger.warn('getAnalyticsDetails: Invalid type', {
        type,
        userId: req.user.id,
        path: req.path,
      });

      return res.status(400).render('error', {
        title: 'Invalid Request',
        message: 'Invalid analytics type. Must be likers, followers, or chatters.',
        user: req.user,
        csrfToken: res.locals['csrfToken'],
      });
    }

    // 3) User twins load
    const userTwins = await db.query(
      'SELECT id FROM "Twin" WHERE "userId" = $1',
      [req.user.id],
    );
    const twinIds = userTwins.rows.map((t: any) => t.id);

    // 4) अगर user के पास कोई twin नहीं
    if (twinIds.length === 0) {
      logger.info('getAnalyticsDetails: User has no twins', { userId: req.user.id });

      return res.render('analytics-details', {
        title: `Analytics Details - ${type}`,
        user: req.user,
        type,
        data: [],
        pagination: { page: 1, limit: 50, total: 0 },
        csrfToken: res.locals['csrfToken'],
      });
    }

// 5) twinId token हो तो verify करें (optional filter)
// ✅ FIX: If invalid, just ignore and show all twins (don't crash)
let targetTwinIds = twinIds;
if (twinId) {
  try {
    const decoded = detokenizeId(twinId as string);
    if (decoded && decoded.type === 'twin') {
      const actualTwinId = decoded.id;
      if (twinIds.includes(actualTwinId)) {
        targetTwinIds = [actualTwinId];
      } else {
        logger.warn('getAnalyticsDetails: User does not own this twin', {
          twinId: actualTwinId,
          userId: req.user.id,
        });
        // Continue with all twins instead of error
      }
    } else {
      logger.warn('getAnalyticsDetails: Invalid twin token type', {
        userId: req.user.id,
      });
      // Continue with all twins instead of error
    }
  } catch (e) {
    logger.warn('getAnalyticsDetails: Failed to detokenize twinId, ignoring', {
      error: e instanceof Error ? e.message : 'Unknown error',
      userId: req.user.id,
    });
    // ✅ FIX: Don't return error, just continue with all twins
    // Continue with all twins instead of crashing
  }
}


    // 6) Pagination
    const parsedPage = parseInt(page as string) || 1;
    const parsedLimit = parseInt(limit as string) || 2;
    const offset = (parsedPage - 1) * parsedLimit;

    let data: any[] = [];
    let total = 0;

    // 7) Data fetch per type
    if (type === 'likers') {
      const result = await db.query(
        `SELECT 
           u.id, u.name, u.handle, u."profileImage", 
           tl."createdAt" as likedAt,
           COALESCE(
             (SELECT t."publicHandle" 
              FROM "Twin" t 
              WHERE t."userId" = u.id 
                AND t."isPublic" = true 
              ORDER BY t."createdAt" DESC 
              LIMIT 1),
             NULL
           ) as "twinPublicHandle"
         FROM "TwinLike" tl
         JOIN "User" u ON tl."userId" = u.id
         WHERE tl."twinId" = ANY($1::text[])
         ${search ? `AND (u.name ILIKE $2 OR u.handle ILIKE $2)` : ''}
         ORDER BY tl."createdAt" DESC
         LIMIT $${search ? '3' : '2'} OFFSET $${search ? '4' : '3'}`,
        search
          ? [targetTwinIds, `%${search}%`, parsedLimit, offset]
          : [targetTwinIds, parsedLimit, offset],
      );

      data = result.rows || [];

      const countResult = await db.query(
        `SELECT COUNT(*) as count FROM "TwinLike" WHERE "twinId" = ANY($1::text[])`,
        [targetTwinIds],
      );
      total = parseInt(countResult.rows[0]?.count || '0');
    } else if (type === 'followers') {
      const result = await db.query(
        `SELECT 
           u.id, u.name, u.handle, u."profileImage", 
           tf."createdAt" as followedAt,
           COALESCE(
             (SELECT t."publicHandle" 
              FROM "Twin" t 
              WHERE t."userId" = u.id 
                AND t."isPublic" = true 
              ORDER BY t."createdAt" DESC 
              LIMIT 1),
             NULL
           ) as "twinPublicHandle"
         FROM "TwinFollow" tf
         JOIN "User" u ON tf."userId" = u.id
         WHERE tf."twinId" = ANY($1::text[])
         ${search ? `AND (u.name ILIKE $2 OR u.handle ILIKE $2)` : ''}
         ORDER BY tf."createdAt" DESC
         LIMIT $${search ? '3' : '2'} OFFSET $${search ? '4' : '3'}`,
        search
          ? [targetTwinIds, `%${search}%`, parsedLimit, offset]
          : [targetTwinIds, parsedLimit, offset],
      );

      data = result.rows || [];

      const countResult = await db.query(
        `SELECT COUNT(*) as count FROM "TwinFollow" WHERE "twinId" = ANY($1::text[])`,
        [targetTwinIds],
      );
      total = parseInt(countResult.rows[0]?.count || '0');
    } else if (type === 'chatters') {
      const result = await db.query(
        `SELECT DISTINCT
            u.id,
            u.name,
            u.handle,
            u."profileImage",
            MAX(c."createdAt") as "lastChatAt",
            MIN(c."createdAt") as "firstChatAt",
            COUNT(DISTINCT c.id) as "chatCount",
            COUNT(DISTINCT m.id) as "messageCount",
            COALESCE(
              (SELECT t."publicHandle" 
               FROM "Twin" t 
               WHERE t."userId" = u.id 
                 AND t."isPublic" = true 
               ORDER BY t."createdAt" DESC 
               LIMIT 1),
              NULL
            ) as "twinPublicHandle"
         FROM "PublicChat" c
         JOIN "User" u ON c."userId" = u.id
         LEFT JOIN "PublicMessage" m ON c.id = m."chatId"
         WHERE c."twinId" = ANY($1::text[])
         ${search ? `AND (u.name ILIKE $2 OR u.handle ILIKE $2)` : ''}
         GROUP BY u.id, u.name, u.handle, u."profileImage"
         ORDER BY "lastChatAt" DESC
         LIMIT $${search ? '3' : '2'} OFFSET $${search ? '4' : '3'}`,
        search
          ? [targetTwinIds, `%${search}%`, parsedLimit, offset]
          : [targetTwinIds, parsedLimit, offset],
      );
      
      data = result.rows || [];
    
      const countResult = await db.query(
        `SELECT COUNT(DISTINCT c."userId") as count FROM "PublicChat" c WHERE c."twinId" = ANY($1::text[])`,
        [targetTwinIds],
      );
      total = parseInt(countResult.rows[0]?.count || '0');
    }      

   else {
      data = [];
      total = 0;
    }

    if (!Array.isArray(data)) {
      data = [];
    }

    return res.render('analytics-details', {
      title: `Analytics Details - ${type}`,
      user: req.user,
      type,
      data,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total,
      },
      csrfToken: res.locals['csrfToken'],
    });
  } catch (error) {
    logger.error('getAnalyticsDetails: Unhandled error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      userId: req.user?.id,
      path: req.path,
    });
    return next(error);
  }
}