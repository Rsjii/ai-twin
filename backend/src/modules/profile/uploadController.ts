import { Request, Response } from 'express';
import { logger } from '../../config/logger';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { userQueries } from '../../config/database';

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.resolve(process.cwd(), 'public/uploads/profiles');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `profile-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'));
    }
  }
});

export const uploadProfileImage = upload.single('profileImage');

export const handleProfileImageUpload = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // For authenticated users, update their profile
    if (req.user) {
      const currentUser = await userQueries.findByEmail(req.user.email);
      if (!currentUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Delete old profile image if exists
      if (currentUser.profileImage && currentUser.profileImage.startsWith('/uploads/')) {
        const oldImagePath = path.resolve(process.cwd(), `public${currentUser.profileImage}`);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }

      // Update user profile with new image path
      const imagePath = `/uploads/profiles/${req.file.filename}`;
      
      // ✅ FIX: Convert dob to string if it's a Date object (dob.trim is not a function error)
      let dobString = '';
      if (currentUser.dob) {
        if (currentUser.dob instanceof Date) {
          dobString = currentUser.dob.toISOString().split('T')[0]; // Format as YYYY-MM-DD
        } else if (typeof currentUser.dob === 'string') {
          dobString = currentUser.dob;
        }
      }
      
      // ✅ SIMPLE: Sirf DB update, extra logs / fs checks hata diye
      await userQueries.updateProfile(
        req.user.email,
        currentUser.name || '',
        currentUser.handle || '',
        dobString,
        currentUser.phone || '',
        currentUser.bio || '',
        imagePath
      );

      res.json({
        success: true,
        imageUrl: imagePath,
        message: 'Profile image updated successfully'
      });
    } else {
      // For unauthenticated users (during signup), just return the image URL
      const imagePath = `/uploads/profiles/${req.file.filename}`;
      res.json({
        success: true,
        imageUrl: imagePath,
        message: 'Image uploaded successfully'
      });
    }

  } catch (error) {
    logger.error('Profile image upload error:', error);
    res.status(500).json({ error: 'Failed to upload profile image' });
  }
};
