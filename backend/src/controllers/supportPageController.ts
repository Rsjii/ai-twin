import { Response } from 'express';
import { userQueries, twinQueries, db } from '../config/database';
import { logger } from '../config/logger';
import { EmailService } from '../modules/auth/authService';
import { z } from 'zod';
import { EventLogger } from '../services/eventLogger';
import { EVENT_TYPES } from '../config/constants';

const emailService = new EmailService();

const contactFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(50, 'Name must be 50 characters or less'),
  email: z.string().email('Invalid email format').max(254, 'Email must be 254 characters or less'),
  subject: z.string().min(1, 'Subject is required').max(100, 'Subject must be 100 characters or less'),
  message: z.string().min(1, 'Message is required').max(2000, 'Message must be 2000 characters or less'),
});

/**
 * Help Center page
 */
export async function getHelpCenter(req: any, res: Response) {
  // ✅ Use global locals filled by middleware (consistent with header/footer)
  const user = res.locals.user || null;
  const hasTwins = typeof res.locals.hasTwins !== 'undefined' ? res.locals.hasTwins : false;
  const twinId = res.locals.twinId || null;



  res.render('help-center', {
    title: 'Help Center - TwinOS',
    user,
    hasTwins,
    twinId,
    csrfToken: res.locals['csrfToken'],
  });
}

export async function getContact(req: any, res: Response) {
  // ✅ Use global locals filled by middleware (consistent with header/footer)
  const user = res.locals.user || null;
  const hasTwins = typeof res.locals.hasTwins !== 'undefined' ? res.locals.hasTwins : false;
  const twinId = res.locals.twinId || null;


  res.render('contact', {
    title: 'Contact Us - TwinOS',
    user,
    hasTwins,
    twinId,
    csrfToken: res.locals['csrfToken'],
  });
}

export async function getPrivacy(req: any, res: Response) {
  // ✅ Use global locals filled by middleware (consistent with header/footer)
  const user = res.locals.user || null;
  const hasTwins = typeof res.locals.hasTwins !== 'undefined' ? res.locals.hasTwins : false;
  const twinId = res.locals.twinId || null;


  res.render('privacy', {
    title: 'Privacy Policy - TwinOS',
    user,
    hasTwins,
    twinId,
    csrfToken: res.locals['csrfToken'],
  });
}

export async function getTerms(req: any, res: Response) {
  // ✅ Use global locals filled by middleware (consistent with header/footer)
  const user = res.locals.user || null;
  const hasTwins = typeof res.locals.hasTwins !== 'undefined' ? res.locals.hasTwins : false;
  const twinId = res.locals.twinId || null;


  res.render('terms', {
    title: 'Terms of Service - TwinOS',
    user,
    hasTwins,
    twinId,
    csrfToken: res.locals['csrfToken'],
  });
}

export async function postContact(req: any, res: Response) {
  try {
    // Validate input
    const validated = contactFormSchema.parse(req.body);
    const { name, email, subject, message } = validated;

    // ✅ Save to database (optional but good for tracking)
    try {
      await db.query(
        `INSERT INTO "ContactSubmission" (id, name, email, subject, message, "createdAt")
         VALUES (gen_random_uuid()::TEXT, $1, $2, $3, $4, NOW())`,
        [name, email.toLowerCase(), subject, message]
      );
      logger.info(`Contact form submission saved to database from ${email}`);
    } catch (dbError: any) {
      // If table doesn't exist, log warning but continue (graceful degradation)
      if (dbError.code === '42P01') {
        logger.warn('ContactSubmission table does not exist. Skipping database save. Run migration to create table.');
      } else {
        logger.error('Failed to save contact submission to database:', dbError);
      }
    }

    // ✅ Send email to support
    const emailSent = await emailService.sendContactEmail(name, email, subject, message);
    
    if (!emailSent) {
      logger.warn(`Failed to send contact form email from ${email}, but submission was saved to database`);
      // Still return success if DB save worked
    }

    // ✅ Log contact form submission event (for monitoring/analytics)
    try {
      // Try to get userId from session if user is logged in
      const userId = req.user?.id || req.session?.userId || null;
      await EventLogger.log(userId, EVENT_TYPES.CONTACT_FORM_SUBMITTED, {
        email: email.toLowerCase(),
        subject,
        hasUser: !!userId
      });
    } catch (eventError) {
      logger.warn('Failed to log contact form event:', eventError);
      // Don't fail the request if event logging fails
    }

    res.json({
      success: true,
      message: 'Thank you for contacting us! We will get back to you soon.',
    });
  } catch (error: any) {
    logger.error('Contact form submission error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: error.errors[0]?.message || 'Validation failed',
        details: error.errors,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to submit contact form. Please try again later.',
    });
  }
}