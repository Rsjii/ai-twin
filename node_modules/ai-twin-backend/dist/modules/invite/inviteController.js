"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processInviteAcceptance = exports.acceptInvite = exports.createInvite = void 0;
const db_1 = require("../../config/db");
const authService_1 = require("../auth/authService");
const logger_1 = require("../../config/logger");
const createInvite = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const code = (0, authService_1.generateInviteCode)();
        const invite = await db_1.prisma.invite.create({
            data: {
                code,
                inviterId: req.user.id,
            },
        });
        await db_1.prisma.event.create({
            data: {
                userId: req.user.id,
                type: 'invite_sent',
                meta: { inviteId: invite.id, code },
            },
        });
        const inviteUrl = `/?ref=${code}`;
        res.json({
            success: true,
            inviteUrl,
            code,
        });
    }
    catch (error) {
        logger_1.logger.error('Create invite error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.createInvite = createInvite;
const acceptInvite = async (req, res) => {
    try {
        const { ref: code } = req.query;
        if (!code || typeof code !== 'string') {
            return res.status(400).json({ error: 'Invalid invite code' });
        }
        const invite = await db_1.prisma.invite.findUnique({
            where: { code },
            include: {
                inviter: {
                    select: {
                        id: true,
                        email: true,
                        handle: true,
                    },
                },
            },
        });
        if (!invite) {
            return res.status(404).json({ error: 'Invalid invite code' });
        }
        if (invite.acceptedBy) {
            return res.status(400).json({ error: 'Invite already used' });
        }
        res.json({
            success: true,
            invite: {
                code: invite.code,
                inviter: invite.inviter,
                createdAt: invite.createdAt,
            },
        });
    }
    catch (error) {
        logger_1.logger.error('Accept invite error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.acceptInvite = acceptInvite;
const processInviteAcceptance = async (req, res) => {
    try {
        const { code } = req.body;
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        if (!code) {
            return res.status(400).json({ error: 'Invite code required' });
        }
        const invite = await db_1.prisma.invite.findUnique({
            where: { code },
        });
        if (!invite) {
            return res.status(404).json({ error: 'Invalid invite code' });
        }
        if (invite.acceptedBy) {
            return res.status(400).json({ error: 'Invite already used' });
        }
        await db_1.prisma.invite.update({
            where: { id: invite.id },
            data: { acceptedBy: req.user.id },
        });
        await db_1.prisma.event.create({
            data: {
                userId: req.user.id,
                type: 'invite_accepted',
                meta: { inviteId: invite.id, inviterId: invite.inviterId },
            },
        });
        res.json({ success: true });
    }
    catch (error) {
        logger_1.logger.error('Process invite acceptance error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.processInviteAcceptance = processInviteAcceptance;
//# sourceMappingURL=inviteController.js.map