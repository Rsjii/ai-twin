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
exports.processInviteAcceptance = exports.acceptInvite = exports.getMyReferrals = exports.getMyReferralCode = void 0;
const authService_1 = require("../auth/authService");
const logger_1 = require("../../config/logger");
const database_1 = require("../../config/database");
const eventLogger_1 = require("../../services/eventLogger");
const getMyReferralCode = async (req, res) => {
    try {
        console.log('🔵 getMyReferralCode called by user:', req.user?.email);
        if (!req.user) {
            console.log('❌ No user in request');
            return res.status(401).json({ error: 'Authentication required' });
        }
        console.log('👤 User ID:', req.user.id);
        const { db } = await Promise.resolve().then(() => __importStar(require('../../config/database')));
        console.log('🔍 Querying database for referralCode...');
        const result = await db.query('SELECT "referralCode" FROM "User" WHERE id = $1', [req.user.id]);
        console.log('📊 Database result:', result.rows[0]);
        if (!result.rows[0]?.referralCode) {
            console.log('🆕 No referral code found, generating new one...');
            const code = (0, authService_1.generateInviteCode)();
            console.log('🎫 Generated code:', code);
            await db.query('UPDATE "User" SET "referralCode" = $1 WHERE id = $2', [code, req.user.id]);
            console.log('✅ New referral code saved to database');
            return res.json({
                success: true,
                referralCode: code,
                referralUrl: `/?ref=${code}`
            });
        }
        const code = result.rows[0].referralCode;
        console.log('✅ Using existing referral code:', code);
        res.json({
            success: true,
            referralCode: code,
            referralUrl: `/?ref=${code}`
        });
    }
    catch (error) {
        console.error('❌ Get referral code error:', error);
        logger_1.logger.error('Get referral code error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getMyReferralCode = getMyReferralCode;
const getMyReferrals = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const referrals = await database_1.db.query(`SELECT 
         i.*, 
         u.id as referred_user_id, u.email, u.name, u.handle, u."createdAt" as user_created
       FROM "Invite" i
       JOIN "User" u ON i."acceptedBy" = u.id
       WHERE i."inviterId" = $1 AND i."acceptedBy" IS NOT NULL
       ORDER BY i."createdAt" DESC`, [req.user.id]);
        res.json({
            success: true,
            count: referrals.rows.length,
            referrals: referrals.rows.map(r => ({
                code: r.code,
                referredUser: {
                    id: r.referred_user_id,
                    email: r.email,
                    name: r.name,
                    handle: r.handle,
                    createdAt: r.user_created
                },
                joinedAt: r.createdAt
            }))
        });
    }
    catch (error) {
        logger_1.logger.error('Get referrals error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getMyReferrals = getMyReferrals;
const acceptInvite = async (req, res) => {
    try {
        const { ref: code } = req.query;
        if (!code || typeof code !== 'string') {
            return res.status(400).json({ error: 'Invalid invite code' });
        }
        const inviteResult = await database_1.db.query(`SELECT i.*, u.id as inviter_id, u.email as inviter_email, u.handle as inviter_handle
       FROM "Invite" i
       JOIN "User" u ON i."inviterId" = u.id
       WHERE i.code = $1`, [code]);
        if (!inviteResult.rows.length) {
            return res.status(404).json({ error: 'Invalid invite code' });
        }
        const invite = inviteResult.rows[0];
        if (invite.acceptedBy) {
            return res.status(400).json({ error: 'Invite already used' });
        }
        res.json({
            success: true,
            invite: {
                code: invite.code,
                inviter: {
                    id: invite.inviter_id,
                    email: invite.inviter_email,
                    handle: invite.inviter_handle,
                },
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
        const inviteResult = await database_1.db.query('SELECT * FROM "Invite" WHERE code = $1', [code]);
        if (!inviteResult.rows.length) {
            return res.status(404).json({ error: 'Invalid invite code' });
        }
        const invite = inviteResult.rows[0];
        if (invite.acceptedBy) {
            return res.status(400).json({ error: 'Invite already used' });
        }
        await database_1.db.query('UPDATE "Invite" SET "acceptedBy" = $1 WHERE id = $2', [req.user.id, invite.id]);
        await (0, eventLogger_1.logEvent)(invite.inviterId, 'invite_accepted', { inviteId: invite.id, inviterId: invite.inviterId });
        res.json({ success: true });
    }
    catch (error) {
        logger_1.logger.error('Process invite acceptance error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.processInviteAcceptance = processInviteAcceptance;
//# sourceMappingURL=inviteController.js.map