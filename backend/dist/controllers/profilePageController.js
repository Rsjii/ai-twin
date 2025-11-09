"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProfile = getProfile;
exports.getChangePassword = getChangePassword;
const database_1 = require("../config/database");
const logger_1 = require("../config/logger");
const errors_1 = require("../utils/errors");
async function getProfile(req, res) {
    try {
        if (!req.user) {
            return res.redirect('/auth');
        }
        const user = await database_1.userQueries.findByEmail(req.user.email);
        if (!user) {
            return res.redirect('/auth');
        }
        const userTwins = await database_1.twinQueries.findByUserId(user.id);
        const twin = userTwins.length > 0 ? userTwins[0] : null;
        const hasTwins = !!twin;
        const activeTab = req.query.tab || 'profile';
        const userWithDefaults = {
            ...user,
            dob: user.dob || null,
            phone: user?.phone || null,
            bio: user?.bio || null
        };
        res.render('profile', {
            title: 'Profile - AI Twin',
            user: userWithDefaults,
            twin: twin,
            twinId: twin?.id || null,
            hasTwins: hasTwins,
            activeTab: activeTab,
            csrfToken: res.locals['csrfToken'],
        });
    }
    catch (error) {
        logger_1.logger.error('Profile page error:', {
            error: error instanceof Error ? error.message : 'Unknown error',
            userId: req.user?.id,
            path: req.path
        });
        if (error instanceof errors_1.AppError) {
            return res.status(error.statusCode).render('error', {
                title: 'Error',
                message: error.message,
                errorCode: error.errorCode,
                user: req.user || null
            });
        }
        const appError = errors_1.createError.internal('Failed to load profile', error);
        return res.status(appError.statusCode).render('error', {
            title: 'Error',
            message: appError.message,
            errorCode: appError.errorCode,
            user: req.user || null
        });
    }
}
async function getChangePassword(_req, res) {
    return res.redirect('/profile?tab=settings');
}
//# sourceMappingURL=profilePageController.js.map