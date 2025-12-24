import { Request, Response } from 'express';
import { userQueries } from '../../config/database';
import { generateProfileToken, verifyProfileToken } from '../auth/authService';
import { logger } from '../../config/logger';
import { z } from 'zod';
import { logEvent } from '../../services/eventLogger';
import path from 'path';
import fs from 'fs';
import {db} from '../../config/database';

const updateHandleSchema = z.object({
  handle: z.string().min(3, 'Handle must be at least 3 characters').max(20, 'Handle too long').regex(/^[a-zA-Z0-9_-]+$/, 'Handle can only contain letters, numbers, hyphens, and underscores'),
});

export const updateHandle = async (req: Request, res: Response) => {
  try {
    const { handle } = updateHandleSchema.parse(req.body);
    
    // Check if user is logged in via session
    if (!req.session?.userId || !req.session?.userEmail) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Check if handle is already taken
    const existingUser = await userQueries.findByEmail(req.session.userEmail);
    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (existingUser.handle === handle) {
      return res.json({
        success: true,
        handle: existingUser.handle,
      });
    }
    
    // Check if handle is taken by another user
    const { db } = await import('../../config/database');
    const handleCheck = await db.query('SELECT id FROM "User" WHERE handle = $1 AND id != $2', [handle, req.session.userId]);
    if (handleCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Handle already taken' });
    }
    
    // Update user handle using raw SQL
    const updatedUser = await userQueries.updateProfile(
      req.session.userEmail,
      existingUser.name || '',
      handle,
      existingUser.dob || '',
      existingUser.phone || '',
      existingUser.bio || ''
    );
    
    // Update session
    req.session.userHandle = handle;
    
    return res.json({
      success: true,
      handle: updatedUser.handle,
    });
  } catch (error) {
    logger.error('Update handle error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getPublicProfile = async (req: Request, res: Response) => {
  try {
    const { handle } = req.params;
    const { t: token } = req.query;
    
    // Verify token
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Invalid or missing token' });
    }
    
    const tokenData = verifyProfileToken(token);
    if (!tokenData || tokenData.handle !== handle) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }
    
    // Get user by handle using raw SQL
    const { db } = await import('../../config/database');
    const userResult = await db.query('SELECT * FROM "User" WHERE handle = $1', [handle]);
    
    if (!userResult.rows.length) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    const user = userResult.rows[0];
    
    // Get user's latest twin
    const twinResult = await db.query(
      'SELECT id, "userId", "styleVector", "sampleReply", "isPublic", "publicHandle", "bio", "profileImage", "createdAt" FROM "Twin" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT 1',      
      [user.id]
    );
    
    if (!twinResult.rows.length) {
      return res.status(404).json({ error: 'No twin found for this user' });
    }
    
    const twin = twinResult.rows[0];
    
    return res.json({
      user: {
        handle: user.handle,
        createdAt: user.createdAt,
      },
      twin: {
        styleVector: twin.styleVector,
        sampleReply: twin.sampleReply,
        createdAt: twin.createdAt,
      },
    });
  } catch (error) {
    logger.error('Get public profile error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const generateProfileLink = async (req: Request, res: Response) => {
  try {
    // Check if user is logged in via session
    if (!req.session?.userId || !req.session?.userEmail) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get user data
    const user = await userQueries.findByEmail(req.session.userEmail);
    if (!user || !user.handle) {
      return res.status(400).json({ error: 'Handle not set. Please set a handle first.' });
    }
    
    // Generate token
    const token = generateProfileToken(user.id, user.handle);
    const profileUrl = `/p/${user.handle}?t=${token}`;
    
    return res.json({
      success: true,
      profileUrl,
      token,
    });
  } catch (error) {
    logger.error('Generate profile link error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateProfile = async (req: Request, res: Response) => {
  try {
    // Check if user is logged in via JWT
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // ✅ FIX: Handle file upload if present
    let profileImagePath = undefined;
    
    if (req.file) {
      // File was uploaded
      const uploadDir = path.resolve(process.cwd(), 'public/uploads/profiles');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      
      // Get current user to delete old image
      const currentUser = await userQueries.findByEmail(req.user.email);
      if (currentUser && currentUser.profileImage && currentUser.profileImage.startsWith('/uploads/')) {
        const oldImagePath = path.resolve(process.cwd(), `public${currentUser.profileImage}`);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
      
      // Save new file with unique name
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const fileExt = path.extname(req.file.originalname);
      const newFileName = `profile-${uniqueSuffix}${fileExt}`;
      const filePath = path.join(uploadDir, newFileName);
      
      // Write file to disk
      fs.writeFileSync(filePath, req.file.buffer);
      
      // Set profile image path
      profileImagePath = `/uploads/profiles/${newFileName}`;
    }

    // ✅ FIX: Parse form data (can be from multipart/form-data or JSON)
    const updateProfileSchema = z.object({
      name: z.string().min(2, 'Name must be at least 2 characters').optional(),
    
      // ✅ tighten: no spaces, only a-z0-9_ and hyphen if you want
      handle: z.string()
        .min(3, 'Handle must be at least 3 characters')
        .max(20, 'Handle must be at most 20 characters')
        .regex(/^[a-zA-Z0-9_]+$/, 'Handle can only contain letters, numbers, and underscores')
        .optional(),
    
      dob: z.string().optional()
        .refine((value) => {
          if (!value) return true;
          const d = new Date(value);
          if (Number.isNaN(d.getTime())) return false;
          const today = new Date();
          if (d > today) return false;                     // future date
          const ageMs = today.getTime() - d.getTime();
          const ageYears = ageMs / (1000 * 60 * 60 * 24 * 365.25);
          return ageYears >= 13;                          // min age 13
        }, 'Please enter a valid date of birth (must be at least 13 years old and not in the future)'),
    
        phone: z.string()
        .optional()
        .refine((value) => {
          // ✅ Optional field - allow empty
          if (!value || value.trim() === '') return true;
          
          // ✅ MUST start with +
          if (!value.trim().startsWith('+')) {
            return false;
          }
          
          // ✅ Split by space: +[country code] [phone number]
          const parts = value.trim().split(/\s+/);
          
          // ✅ Must have exactly 2 parts: [+countryCode] and [phoneNumber]
          if (parts.length !== 2) {
            return false;
          }
          
          const countryCodePart = parts[0]; // e.g. "+91"
          const phoneNumberPart = parts[1];  // e.g. "1234567890"
          
          // ✅ Country code part: must be + followed by 1-3 digits (not starting with 0)
          if (!/^\+[1-9]\d{0,2}$/.test(countryCodePart)) {
            return false; // +1, +91, +123 valid; +0, +01, +0123 invalid
          }
          
          // ✅ Phone number part: must be exactly 10 digits
          if (!/^\d{10}$/.test(phoneNumberPart)) {
            return false;
          }
          
          return true;
        }, 'Phone number must be in format: +[country code] [10 digits] (e.g. +91 1234567890 or +1 1234567890)'),
                      
      bio: z.string().max(300, 'Bio too long').optional(),
      profileImage: z.string().nullable().optional(),
    });    

    // ✅ FIX: Parse from req.body (multer will parse multipart/form-data)
    const { name, handle, dob, phone, bio, profileImage } = updateProfileSchema.parse(req.body);

    // Get current user data
    const currentUser = await userQueries.findByEmail(req.user.email);
    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const now = new Date();
    const HANDLE_COOLDOWN_DAYS = 45;

    // Check if handle is already taken (if provided and different from current)
    if (handle && handle !== currentUser.handle) {

      // ✅ 1) Rate limit: disallow if changed in last 45 days
  if (currentUser.lastHandleChangeAt) {
    const last = new Date(currentUser.lastHandleChangeAt);
    const diffMs = now.getTime() - last.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays < HANDLE_COOLDOWN_DAYS) {
      const remaining = Math.ceil(HANDLE_COOLDOWN_DAYS - diffDays);
      return res.status(400).json({
        error: `You can change your username again in ${remaining} day(s).`
      });
    }
  }
      const handleCheck = await db.query('SELECT id FROM "User" WHERE handle = $1 AND id != $2', [handle, req.user.userId]);
      
      if (handleCheck.rows.length > 0) {
        return res.status(400).json({ error: 'Handle already taken' });
      }
    }

    // Prepare values for update
    const finalName = name !== undefined ? name : currentUser.name || '';
    const finalHandle = handle !== undefined ? handle : currentUser.handle || '';
    const finalDob = dob !== undefined ? dob : currentUser.dob || '';
    const finalPhone = phone !== undefined ? phone : currentUser.phone || '';
    const finalBio = bio !== undefined ? bio : currentUser.bio || '';
    // ✅ FIX: Use uploaded file path if file was uploaded, otherwise use provided profileImage or current
    const finalProfileImage = profileImagePath !== undefined 
      ? profileImagePath 
      : (profileImage !== undefined ? profileImage : currentUser.profileImage || '');

    // Update user profile using raw SQL
    const updatedUser = await userQueries.updateProfile(
      req.user.email,
      finalName,
      finalHandle,
      finalDob,
      finalPhone,
      finalBio,
      finalProfileImage
    );

    // ✅ If handle changed, store timestamp
if (finalHandle !== currentUser.handle) {
  await db.query(
    'UPDATE "User" SET "lastHandleChangeAt" = NOW() WHERE id = $1',
    [currentUser.id]
  );
}

    return res.json({
      success: true,
      user: {
        name: updatedUser.name,
        handle: updatedUser.handle,
        dob: updatedUser.dob,
        phone: updatedUser.phone,
        bio: updatedUser.bio,
        profileImage: updatedUser.profileImage,
      },
      handle: updatedUser.handle,
    });
  } catch (error) {
    logger.error('Update profile error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const logProfileShare = async (req: Request, res: Response): Promise<void> => {
  try {
    // Check if user is logged in via session
    if (!req.session?.userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Log profile shared event using raw SQL
    await logEvent(req.session.userId, 'profile_shared', {});
    
    res.json({ success: true });
  } catch (error) {
    logger.error('Log profile share error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
