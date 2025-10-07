"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.logProfileShare = exports.updateProfile = exports.generateProfileLink = exports.getPublicProfile = exports.updateHandle = void 0;
const database_1 = require("../../config/database");
const authService_1 = require("../auth/authService");
const logger_1 = require("../../config/logger");
const zod_1 = require("zod");
const updateHandleSchema = zod_1.z.object({
    handle: zod_1.z.string().min(3, 'Handle must be at least 3 characters').max(20, 'Handle too long').regex(/^[a-zA-Z0-9_-]+$/, 'Handle can only contain letters, numbers, hyphens, and underscores'),
});
const updateHandle = async (req, res) => {
    try {
        const { handle } = updateHandleSchema.parse(req.body);
        if (!req.session?.userId || !req.session?.userEmail) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const existingUser = await database_1.userQueries.findByEmail(req.session.userEmail);
        if (!existingUser) {
            return res.status(404).json({ error: 'User not found' });
        }
        if (existingUser.handle === handle) {
            return res.json({
                success: true,
                handle: existingUser.handle,
            });
        }
        const { db } = await Promise.resolve().then(() => __importStar(require('../../config/database')));
        const handleCheck = await db.query('SELECT id FROM "User" WHERE handle = $1 AND id != $2', [handle, req.session.userId]);
        if (handleCheck.rows.length > 0) {
            return res.status(400).json({ error: 'Handle already taken' });
        }
        const updatedUser = await database_1.userQueries.updateProfile(req.session.userEmail, existingUser.name || '', handle, existingUser.dob || '', existingUser.phone || '', existingUser.bio || '');
        req.session.userHandle = handle;
        return res.json({
            success: true,
            handle: updatedUser.handle,
        });
    }
    catch (error) {
        logger_1.logger.error('Update handle error:', error);
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: 'Invalid input', details: error.errors });
        }
        return res.status(500).json({ error: 'Internal server error' });
    }
};
exports.updateHandle = updateHandle;
const getPublicProfile = async (req, res) => {
    try {
        const { handle } = req.params;
        const { t: token } = req.query;
        if (!token || typeof token !== 'string') {
            return res.status(400).json({ error: 'Invalid or missing token' });
        }
        const tokenData = (0, authService_1.verifyProfileToken)(token);
        if (!tokenData || tokenData.handle !== handle) {
            return res.status(400).json({ error: 'Invalid or expired token' });
        }
        const { db } = await Promise.resolve().then(() => __importStar(require('../../config/database')));
        const userResult = await db.query('SELECT * FROM "User" WHERE handle = $1', [handle]);
        if (!userResult.rows.length) {
            return res.status(404).json({ error: 'Profile not found' });
        }
        const user = userResult.rows[0];
        const twinResult = await db.query('SELECT * FROM "Twin" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT 1', [user.id]);
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
    }
    catch (error) {
        logger_1.logger.error('Get public profile error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getPublicProfile = getPublicProfile;
const generateProfileLink = async (req, res) => {
    try {
        if (!req.session?.userId || !req.session?.userEmail) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const user = await database_1.userQueries.findByEmail(req.session.userEmail);
        if (!user || !user.handle) {
            return res.status(400).json({ error: 'Handle not set. Please set a handle first.' });
        }
        const token = (0, authService_1.generateProfileToken)(user.id, user.handle);
        const profileUrl = `/p/${user.handle}?t=${token}`;
        return res.json({
            success: true,
            profileUrl,
            token,
        });
    }
    catch (error) {
        logger_1.logger.error('Generate profile link error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};
exports.generateProfileLink = generateProfileLink;
const updateProfile = async (req, res) => {
    try {
        console.log('UpdateProfile called. User:', req.user);
        if (!req.user) {
            console.log('Authentication failed - no user in request');
            return res.status(401).json({ error: 'Authentication required' });
        }
        const updateProfileSchema = zod_1.z.object({
            name: zod_1.z.string().min(2, 'Name must be at least 2 characters').optional(),
            handle: zod_1.z.string().min(3, 'Handle must be at least 3 characters').max(20, 'Handle too long').regex(/^[a-zA-Z0-9_\s-]+$/, 'Handle can only contain letters, numbers, spaces, hyphens, and underscores').optional(),
            dob: zod_1.z.string().optional(),
            phone: zod_1.z.string().optional(),
            bio: zod_1.z.string().max(500, 'Bio too long').optional(),
            profileImage: zod_1.z.string().nullable().optional(),
        });
        const { name, handle, dob, phone, bio, profileImage } = updateProfileSchema.parse(req.body);
        const currentUser = await database_1.userQueries.findByEmail(req.user.email);
        if (!currentUser) {
            return res.status(404).json({ error: 'User not found' });
        }
        if (handle && handle !== currentUser.handle) {
            const { db } = await Promise.resolve().then(() => __importStar(require('../../config/database')));
            const handleCheck = await db.query('SELECT id FROM "User" WHERE handle = $1 AND id != $2', [handle, req.user.userId]);
            if (handleCheck.rows.length > 0) {
                return res.status(400).json({ error: 'Handle already taken' });
            }
        }
        const finalName = name !== undefined ? name : currentUser.name || '';
        const finalHandle = handle !== undefined ? handle : currentUser.handle || '';
        const finalDob = dob !== undefined ? dob : currentUser.dob || '';
        const finalPhone = phone !== undefined ? phone : currentUser.phone || '';
        const finalBio = bio !== undefined ? bio : currentUser.bio || '';
        const finalProfileImage = profileImage !== undefined ? profileImage : currentUser.profileImage || '';
        const updatedUser = await database_1.userQueries.updateProfile(req.user.email, finalName, finalHandle, finalDob, finalPhone, finalBio, finalProfileImage);
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
    }
    catch (error) {
        logger_1.logger.error('Update profile error:', error);
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: 'Invalid input', details: error.errors });
        }
        return res.status(500).json({ error: 'Internal server error' });
    }
};
exports.updateProfile = updateProfile;
const logProfileShare = async (req, res) => {
    try {
        if (!req.session?.userId) {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }
        const { db, generateId } = await Promise.resolve().then(() => __importStar(require('../../config/database')));
        await db.query('INSERT INTO "Event" (id, "userId", type, meta) VALUES ($1, $2, $3, $4)', [generateId(), req.session.userId, 'profile_shared', null]);
        res.json({ success: true });
    }
    catch (error) {
        logger_1.logger.error('Log profile share error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.logProfileShare = logProfileShare;
//# sourceMappingURL=profileController.js.map