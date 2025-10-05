"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logProfileShare = exports.generateProfileLink = exports.getPublicProfile = exports.updateHandle = void 0;
const db_1 = require("../../config/db");
const authService_1 = require("../auth/authService");
const logger_1 = require("../../config/logger");
const zod_1 = require("zod");
const updateHandleSchema = zod_1.z.object({
    handle: zod_1.z.string().min(3, 'Handle must be at least 3 characters').max(20, 'Handle too long').regex(/^[a-zA-Z0-9_-]+$/, 'Handle can only contain letters, numbers, hyphens, and underscores'),
});
const updateHandle = async (req, res) => {
    try {
        const { handle } = updateHandleSchema.parse(req.body);
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const existingUser = await db_1.prisma.user.findUnique({
            where: { handle },
        });
        if (existingUser && existingUser.id !== req.user.id) {
            return res.status(400).json({ error: 'Handle already taken' });
        }
        const user = await db_1.prisma.user.update({
            where: { id: req.user.id },
            data: { handle },
        });
        req.session.userHandle = handle;
        res.json({
            success: true,
            handle: user.handle,
        });
    }
    catch (error) {
        logger_1.logger.error('Update handle error:', error);
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: 'Invalid input', details: error.errors });
        }
        res.status(500).json({ error: 'Internal server error' });
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
        const user = await db_1.prisma.user.findUnique({
            where: { handle },
            include: {
                twins: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    select: {
                        styleVector: true,
                        sampleReply: true,
                        createdAt: true,
                    },
                },
            },
        });
        if (!user || !user.twins.length) {
            return res.status(404).json({ error: 'Profile not found' });
        }
        const twin = user.twins[0];
        res.json({
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
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getPublicProfile = getPublicProfile;
const generateProfileLink = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        if (!req.user.handle) {
            return res.status(400).json({ error: 'Handle not set. Please set a handle first.' });
        }
        const token = (0, authService_1.generateProfileToken)(req.user.id, req.user.handle);
        const profileUrl = `/p/${req.user.handle}?t=${token}`;
        res.json({
            success: true,
            profileUrl,
            token,
        });
    }
    catch (error) {
        logger_1.logger.error('Generate profile link error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.generateProfileLink = generateProfileLink;
const logProfileShare = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        await db_1.prisma.event.create({
            data: {
                userId: req.user.id,
                type: 'profile_shared',
            },
        });
        res.json({ success: true });
    }
    catch (error) {
        logger_1.logger.error('Log profile share error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.logProfileShare = logProfileShare;
//# sourceMappingURL=profileController.js.map