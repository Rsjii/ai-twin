import { Response, NextFunction} from 'express';
import { db, userQueries } from '../config/database';
import { logger } from '../config/logger';
import { AppError, createError } from '../utils/errors';
import { ADMIN_EMAILS, QUERY_LIMITS} from '../config/constants';
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
      title: 'Analytics Dashboard - Selflyx',
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
      throw createError.notFound('This page does not exist');
    }

    const fullUser = await userQueries.findByEmail(req.user.email);
    if (!fullUser) {
      return res.redirect('/auth');
    }

    res.render('admin-analytics', {
      title: 'Admin Analytics Dashboard - Selflyx',
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
      throw createError.notFound('This page does not exist');
    }

    const { type } = req.params;
    const validTypes = ['users', 'twins', 'chats', 'messages', 'tokens'];
    
    if (!validTypes.includes(type)) {
      throw createError.notFound('Invalid page type');
    }

    const fullUser = await userQueries.findByEmail(req.user.email);
    if (!fullUser) {
      return res.redirect('/auth');
    }

    res.render(`admin-analytics-${type}`, {
      title: `Admin Analytics - ${type.charAt(0).toUpperCase() + type.slice(1)} - Selflyx`,
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
      throw createError.notFound('This page does not exist');
    }

    const fullUser = await userQueries.findByEmail(req.user.email);
    if (!fullUser) {
      return res.redirect('/auth');
    }

    res.render('admin-analytics-events', {
      title: 'Admin Analytics - Events Explorer - Selflyx',
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
      throw createError.notFound('This page does not exist');
    }

    const fullUser = await userQueries.findByEmail(req.user.email);
    if (!fullUser) {
      return res.redirect('/auth');
    }

    res.render('admin-analytics-activity', {
      title: 'Admin Analytics - Activity Feed - Selflyx',
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

      throw createError.validation(
        'Invalid analytics type. Must be likers, followers, or chatters.'
      );
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
        user: res.locals.user || req.user,
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


    // 6) Pagination with clamped limit
    const rawPage = Number(page) || 1;
    const rawLimit = Number(limit) || QUERY_LIMITS.ANALYTICS_DETAILS;

    const parsedPage = Math.max(rawPage, 1);
    const parsedLimit = Math.min(
      Math.max(rawLimit, QUERY_LIMITS.MIN_PAGE_SIZE),
      QUERY_LIMITS.MAX_PAGE_SIZE,
    );
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
          AND NOT EXISTS (
            SELECT 1
            FROM "Twin" t2
            JOIN "TwinBlockedUsers" tbu ON tbu."twinId" = t2.id
            WHERE t2."userId" = u.id
              AND tbu."userId" = $2
          )
         ${search ? `AND (u.name ILIKE $3 OR u.handle ILIKE $3)` : ''}
         ORDER BY tl."createdAt" DESC
         LIMIT $${search ? '4' : '3'} OFFSET $${search ? '5' : '4'}`,
        search
          ? [targetTwinIds, req.user.id, `%${search}%`, parsedLimit, offset]
          : [targetTwinIds, req.user.id, parsedLimit, offset],
      );

      data = result.rows || [];

      const countResult = await db.query(
        `SELECT COUNT(*) as count 
         FROM "TwinLike" tl
         JOIN "User" u ON tl."userId" = u.id
         WHERE tl."twinId" = ANY($1::text[])
           AND NOT EXISTS (
             SELECT 1
             FROM "Twin" t2
             JOIN "TwinBlockedUsers" tbu ON tbu."twinId" = t2.id
             WHERE t2."userId" = u.id
               AND tbu."userId" = $2
           )`,
        [targetTwinIds, req.user.id],
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
          AND NOT EXISTS (
            SELECT 1
            FROM "Twin" t2
            JOIN "TwinBlockedUsers" tbu ON tbu."twinId" = t2.id
            WHERE t2."userId" = u.id
              AND tbu."userId" = $2
          )
         ${search ? `AND (u.name ILIKE $3 OR u.handle ILIKE $3)` : ''}
         ORDER BY tf."createdAt" DESC
         LIMIT $${search ? '4' : '3'} OFFSET $${search ? '5' : '4'}`,
        search
          ? [targetTwinIds, req.user.id, `%${search}%`, parsedLimit, offset]
          : [targetTwinIds, req.user.id, parsedLimit, offset],
      );

      data = result.rows || [];

      const countResult = await db.query(
        `SELECT COUNT(*) as count 
         FROM "TwinFollow" tf
         JOIN "User" u ON tf."userId" = u.id
         WHERE tf."twinId" = ANY($1::text[])
           AND NOT EXISTS (
             SELECT 1
             FROM "Twin" t2
             JOIN "TwinBlockedUsers" tbu ON tbu."twinId" = t2.id
             WHERE t2."userId" = u.id
               AND tbu."userId" = $2
           )`,
        [targetTwinIds, req.user.id],
      );
      total = parseInt(countResult.rows[0]?.count || '0');
    } else if (type === 'chatters') {
      // Get logged-in users
      const loggedInUsersResult = await db.query(
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
         LEFT JOIN "PublicMessage" m ON c.id = m."chatId" AND m.sender = 'human'
         WHERE c."twinId" = ANY($1::text[])
           AND c."userId" IS NOT NULL
           AND NOT EXISTS (
             SELECT 1
             FROM "Twin" t2
             JOIN "TwinBlockedUsers" tbu ON tbu."twinId" = t2.id
             WHERE t2."userId" = u.id
               AND tbu."userId" = $2
           )
           AND EXISTS (
             SELECT 1 FROM "PublicMessage" pm 
             WHERE pm."chatId" = c.id 
             AND pm.sender = 'human'
           )
         ${search ? `AND (u.name ILIKE $3 OR u.handle ILIKE $3)` : ''}
         GROUP BY u.id, u.name, u.handle, u."profileImage"
         ORDER BY "lastChatAt" DESC
         LIMIT $${search ? '4' : '3'} OFFSET $${search ? '5' : '4'}`,
        search
          ? [targetTwinIds, req.user.id, `%${search}%`, parsedLimit, offset]
          : [targetTwinIds, req.user.id, parsedLimit, offset],
      );
      
      // Get anonymous users (grouped) - only if not searching
      let anonymousEntry = null;
      if (!search) {
        const anonymousResult = await db.query(
          `SELECT 
              COUNT(DISTINCT c.id) as "chatCount",
              COUNT(DISTINCT m.id) as "messageCount",
              MIN(c."createdAt") as "firstChatAt",
              MAX(c."createdAt") as "lastChatAt"
           FROM "PublicChat" c
           LEFT JOIN "PublicMessage" m ON c.id = m."chatId" AND m.sender = 'human'
           WHERE c."twinId" = ANY($1::text[])
             AND c."userId" IS NULL
             AND EXISTS (
               SELECT 1 FROM "PublicMessage" pm 
               WHERE pm."chatId" = c.id 
               AND pm.sender = 'human'
             )`,
          [targetTwinIds]
        );
        
        if (anonymousResult.rows.length > 0 && parseInt(anonymousResult.rows[0].messageCount) > 0) {
          const anon = anonymousResult.rows[0];
          anonymousEntry = {
            id: null,
            name: 'Anonymous Users',
            handle: 'anonymous',
            profileImage: null,
            lastChatAt: anon.lastChatAt,
            firstChatAt: anon.firstChatAt,
            chatCount: parseInt(anon.chatCount) || 0,
            messageCount: parseInt(anon.messageCount) || 0,
            twinPublicHandle: null,
            isAnonymous: true
          };
        }
      }
      
      // Combine logged-in users with anonymous entry - ensure messageCount is parsed as integer
      const loggedInUsers = (loggedInUsersResult.rows || []).map(row => ({
        ...row,
        chatCount: parseInt(row.chatCount) || 0,
        messageCount: parseInt(row.messageCount) || 0,
        publicUserId: tokenizeId(row.id, 'user') // ✅ Add tokenized user ID for query params
      }));
      data = anonymousEntry 
        ? [...loggedInUsers, anonymousEntry]
        : loggedInUsers;
      
      // Count query - include anonymous
      const countResult = await db.query(
        `SELECT 
            COUNT(DISTINCT u.id) as count
         FROM "PublicChat" c
         JOIN "User" u ON c."userId" = u.id
         WHERE c."twinId" = ANY($1::text[])
           AND c."userId" IS NOT NULL
           AND NOT EXISTS (
             SELECT 1
             FROM "Twin" t2
             JOIN "TwinBlockedUsers" tbu ON tbu."twinId" = t2.id
             WHERE t2."userId" = u.id
               AND tbu."userId" = $2
           )
           AND EXISTS (
             SELECT 1 FROM "PublicMessage" pm 
             WHERE pm."chatId" = c.id 
             AND pm.sender = 'human'
           )`,
        [targetTwinIds, req.user.id],
      );
      
      // Add 1 if anonymous exists
      const loggedInCount = parseInt(countResult.rows[0]?.count || '0');
      total = anonymousEntry ? loggedInCount + 1 : loggedInCount;
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
      user: res.locals.user || req.user,
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
    handleControllerError(error, 'Failed to load analytics details');
  }
}

/**
 * Export analytics details as CSV (user-facing, type-wise).
 * Supports: likers, followers, chatters.
 */
export async function exportAnalyticsDetailsCSV(req: any, res: Response) {
  try {
    const { type, search = '' } = req.query;

    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const validTypes = ['likers', 'followers', 'chatters'];
    if (!type || !validTypes.includes(type as string)) {
      return res.status(400).json({ error: 'Invalid analytics type' });
    }

    // Load all twins for this owner
    const userTwins = await db.query(
      'SELECT id FROM "Twin" WHERE "userId" = $1',
      [req.user.id],
    );
    const twinIds = userTwins.rows.map((t: any) => t.id);
    if (twinIds.length === 0) {
      return res.status(200)
        .header('Content-Type', 'text/csv')
        .header('Content-Disposition', 'attachment; filename="analytics-empty.csv"')
        .send('message\nNo data available');
    }

    const targetTwinIds = twinIds;
    const searchTerm = (search as string).trim();
    const MAX_ROWS = 1000; // simple safety cap

    let rows: any[] = [];

    if (type === 'likers') {
      const result = await db.query(
        `SELECT 
           u.name, u.handle, u.email, u."profileImage",
           tl."createdAt" as likedAt
         FROM "TwinLike" tl
         JOIN "User" u ON tl."userId" = u.id
         WHERE tl."twinId" = ANY($1::text[])
           AND NOT EXISTS (
             SELECT 1
             FROM "Twin" t2
             JOIN "TwinBlockedUsers" tbu ON tbu."twinId" = t2.id
             WHERE t2."userId" = u.id
               AND tbu."userId" = $2
           )
           ${searchTerm ? `AND (u.name ILIKE $3 OR u.handle ILIKE $3)` : ''}
         ORDER BY tl."createdAt" DESC
         LIMIT $${searchTerm ? '4' : '3'}`,
        searchTerm
          ? [targetTwinIds, req.user.id, `%${searchTerm}%`, MAX_ROWS]
          : [targetTwinIds, req.user.id, MAX_ROWS],
      );
      rows = result.rows.map(r => ({
        name: r.name || '',
        handle: r.handle || '',
        email: r.email || '',
        likedAt: r.likedat ? new Date(r.likedat).toISOString() : '',
      }));
    } else if (type === 'followers') {
      const result = await db.query(
        `SELECT 
           u.name, u.handle, u.email, u."profileImage",
           tf."createdAt" as followedAt
         FROM "TwinFollow" tf
         JOIN "User" u ON tf."userId" = u.id
         WHERE tf."twinId" = ANY($1::text[])
           AND NOT EXISTS (
             SELECT 1
             FROM "Twin" t2
             JOIN "TwinBlockedUsers" tbu ON tbu."twinId" = t2.id
             WHERE t2."userId" = u.id
               AND tbu."userId" = $2
           )
           ${searchTerm ? `AND (u.name ILIKE $3 OR u.handle ILIKE $3)` : ''}
         ORDER BY tf."createdAt" DESC
         LIMIT $${searchTerm ? '4' : '3'}`,
        searchTerm
          ? [targetTwinIds, req.user.id, `%${searchTerm}%`, MAX_ROWS]
          : [targetTwinIds, req.user.id, MAX_ROWS],
      );
      rows = result.rows.map(r => ({
        name: r.name || '',
        handle: r.handle || '',
        email: r.email || '',
        followedAt: r.followedat ? new Date(r.followedat).toISOString() : '',
      }));
    } else if (type === 'chatters') {
      const result = await db.query(
        `SELECT DISTINCT
            u.name,
            u.handle,
            u.email,
            COUNT(DISTINCT c.id) as "chatCount",
            COUNT(DISTINCT m.id) as "messageCount",
            MAX(c."createdAt") as "lastChatAt"
         FROM "PublicChat" c
         JOIN "User" u ON c."userId" = u.id
         LEFT JOIN "PublicMessage" m ON c.id = m."chatId"
         WHERE c."twinId" = ANY($1::text[])
           AND NOT EXISTS (
             SELECT 1
             FROM "Twin" t2
             JOIN "TwinBlockedUsers" tbu ON tbu."twinId" = t2.id
             WHERE t2."userId" = u.id
               AND tbu."userId" = $2
           )
           ${searchTerm ? `AND (u.name ILIKE $3 OR u.handle ILIKE $3)` : ''}
         GROUP BY u.name, u.handle, u.email
         ORDER BY "lastChatAt" DESC
         LIMIT $${searchTerm ? '4' : '3'}`,
        searchTerm
          ? [targetTwinIds, req.user.id, `%${searchTerm}%`, MAX_ROWS]
          : [targetTwinIds, req.user.id, MAX_ROWS],
      );
      rows = result.rows.map(r => ({
        name: r.name || '',
        handle: r.handle || '',
        email: r.email || '',
        chatCount: r.chatcount,
        messageCount: r.messagecount,
        lastChatAt: r.lastchatat ? new Date(r.lastchatat).toISOString() : '',
      }));
    }

    const header = Object.keys(rows[0] || { message: 'No data' });
    const records = rows.length > 0 ? rows : [{ message: 'No data' }];

    // ✅ Simple CSV builder (no external dependency)
    const escapeCell = (value: any) => {
      const str = String(value ?? '');
      // Escape quotes and wrap in quotes if it contains comma, quote or newline
      if (/[",\n]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvLines: string[] = [];
    csvLines.push(header.join(',')); // header row
    for (const row of records) {
      csvLines.push(header.map(h => escapeCell((row as any)[h])).join(','));
    }

    res
      .status(200)
      .header('Content-Type', 'text/csv')
      .header('Content-Disposition', `attachment; filename="analytics-${type}.csv"`)
      .send(csvLines.join('\n'));
  } catch (error) {
    logger.error('exportAnalyticsDetailsCSV error:', error);
    res.status(500).json({ error: 'Failed to export analytics' });
  }
}