"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleProfileImageUpload = exports.uploadProfileImage = void 0;
const logger_1 = require("../../config/logger");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const database_1 = require("../../config/database");
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = 'public/uploads/profiles';
        if (!fs_1.default.existsSync(uploadDir)) {
            fs_1.default.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `profile-${uniqueSuffix}${path_1.default.extname(file.originalname)}`);
    }
});
const upload = (0, multer_1.default)({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024,
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path_1.default.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (mimetype && extname) {
            return cb(null, true);
        }
        else {
            cb(new Error('Only image files are allowed!'));
        }
    }
});
exports.uploadProfileImage = upload.single('profileImage');
const handleProfileImageUpload = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        if (req.user) {
            const currentUser = await database_1.userQueries.findByEmail(req.user.email);
            if (!currentUser) {
                return res.status(404).json({ error: 'User not found' });
            }
            if (currentUser.profileImage && currentUser.profileImage.startsWith('/uploads/')) {
                const oldImagePath = `public${currentUser.profileImage}`;
                if (fs_1.default.existsSync(oldImagePath)) {
                    fs_1.default.unlinkSync(oldImagePath);
                }
            }
            const imagePath = `/uploads/profiles/${req.file.filename}`;
            await database_1.userQueries.updateProfile(req.user.email, currentUser.name || '', currentUser.handle || '', currentUser.dob || '', currentUser.phone || '', currentUser.bio || '', imagePath);
            res.json({
                success: true,
                imageUrl: imagePath,
                message: 'Profile image updated successfully'
            });
        }
        else {
            const imagePath = `/uploads/profiles/${req.file.filename}`;
            res.json({
                success: true,
                imageUrl: imagePath,
                message: 'Image uploaded successfully'
            });
        }
    }
    catch (error) {
        logger_1.logger.error('Profile image upload error:', error);
        res.status(500).json({ error: 'Failed to upload profile image' });
    }
};
exports.handleProfileImageUpload = handleProfileImageUpload;
//# sourceMappingURL=uploadController.js.map