import { Router } from 'express';
import { updateHandle, getPublicProfile, generateProfileLink, logProfileShare, updateProfile } from './profileController';
import { uploadProfileImage, handleProfileImageUpload } from './uploadController';
import { optionalAuth } from '../../middleware/auth';
import { generateCSRFToken, validateCSRF } from '../../middleware/csrf';
import { sanitizeInput } from '../../middleware/validation';
import { requireJWTFromCookie } from '../../middleware/jwtCookie';
import multer from 'multer';

const router = Router();

// Public profile route (no auth required)
router.get('/p/:handle', getPublicProfile);

// Apply CSRF token generation to all routes
router.use(generateCSRFToken);

// Configure multer for form data parsing (✅ 5MB limit + image-only)
const upload = multer({
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const name = String(file.originalname || '').toLowerCase();
    const mime = String(file.mimetype || '').toLowerCase();
    const extOk = allowed.test(name);
    const mimeOk = allowed.test(mime);
    if (extOk && mimeOk) return cb(null, true);
    cb(new Error('Only image files are allowed (jpeg/jpg/png/gif/webp).'));
  }
});

// Protected routes (JWT cookie-based auth)
router.post('/handle', sanitizeInput, validateCSRF, requireJWTFromCookie, updateHandle);
router.post('/link', validateCSRF, requireJWTFromCookie, generateProfileLink);
router.post('/share', validateCSRF, requireJWTFromCookie, logProfileShare);
router.post(
  '/update',
  (req, res, next) => {
    upload.single('profileImageFile')(req, res, (err: any) => {
      if (!err) return next();

      // ✅ proper size exceeded error
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          success: false,
          error: 'Image too large. Max size is 5MB.'
        });
      }

      return res.status(400).json({
        success: false,
        error: err.message || 'Invalid image upload.'
      });
    });
  },
  validateCSRF,
  requireJWTFromCookie,
  updateProfile
);
router.post(
  '/upload',
  (req, res, next) => {
    uploadProfileImage(req as any, res as any, (err: any) => {
      if (!err) return next();

      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          success: false,
          error: 'Image too large. Max size is 5MB.'
        });
      }

      return res.status(400).json({
        success: false,
        error: err.message || 'Invalid image upload.'
      });
    });
  },
  handleProfileImageUpload
);

export default router;
