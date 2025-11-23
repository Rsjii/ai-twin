import { Request, Response } from 'express';
import { userQueries } from '../../config/database';
import { generateProfileToken, verifyProfileToken } from '../auth/authService';
import { logger } from '../../config/logger';
import { z } from 'zod';
import { logEvent } from '../../services/eventLogger';
import path from 'path';
import fs from 'fs';

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
    console.log('UpdateProfile called. User:', req.user);
    
    // Check if user is logged in via JWT
    if (!req.user) {
      console.log('Authentication failed - no user in request');
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
      handle: z.string().min(3, 'Handle must be at least 3 characters').max(20, 'Handle too long').regex(/^[a-zA-Z0-9_\s-]+$/, 'Handle can only contain letters, numbers, spaces, hyphens, and underscores').optional(),
      dob: z.string().optional(),
      phone: z.string().optional(),
      bio: z.string().max(500, 'Bio too long').optional(),
      profileImage: z.string().nullable().optional(),
    });

    // ✅ FIX: Parse from req.body (multer will parse multipart/form-data)
    const { name, handle, dob, phone, bio, profileImage } = updateProfileSchema.parse(req.body);

    // Get current user data
    const currentUser = await userQueries.findByEmail(req.user.email);
    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if handle is already taken (if provided and different from current)
    if (handle && handle !== currentUser.handle) {
      const { db } = await import('../../config/database');
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
