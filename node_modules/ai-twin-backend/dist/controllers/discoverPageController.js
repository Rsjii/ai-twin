"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDiscover = getDiscover;
exports.getOnboarding = getOnboarding;
exports.getMemoryManagement = getMemoryManagement;
const database_1 = require("../config/database");
const logger_1 = require("../config/logger");
async function getDiscover(req, res) {
    try {
        const user = res.locals.user || null;
        const hasTwins = typeof res.locals.hasTwins !== 'undefined' ? res.locals.hasTwins : false;
        const twinId = res.locals.twinId || null;
        try {
            logger_1.logger.info('[PAGE_DISCOVER]', {
                path: req.path,
                userFromReq: req.user
                    ? {
                        id: req.user.id,
                        email: req.user.email,
                        handle: req.user.handle,
                    }
                    : null,
                userFromLocals: user
                    ? {
                        id: user.id,
                        email: user.email,
                        handle: user.handle,
                    }
                    : null,
                hasTwins,
                twinId,
            });
        }
        catch (logError) {
            logger_1.logger.warn('[PAGE_DISCOVER] Failed to log context:', logError);
        }
        console.log('[PAGE_DISCOVER] Render data:', {
            user: user ? { id: user.id, email: user.email, handle: user.handle } : null,
            hasTwins,
            twinId,
            userFromReq: req.user ? { id: req.user.id, email: req.user.email } : null,
            userFromLocals: user ? { id: user.id, email: user.email } : null,
            jwtCookiePresent: !!req.cookies?.['jwtToken'],
            cookies: Object.keys(req.cookies || {}),
        });
        res.render('discover', {
            title: 'Discover AI Twins - Twinverse',
            user,
            pathname: '/discover',
            hasTwins,
            twinId,
            csrfToken: res.locals['csrfToken']
        });
    }
    catch (error) {
        logger_1.logger.error('Discover page error:', error);
        res.render('discover', {
            title: 'Discover AI Twins - Twinverse',
            user: null,
            hasTwins: false,
            twinId: null,
            csrfToken: res.locals['csrfToken']
        });
    }
}
async function getOnboarding(req, res) {
    if (req.user?.id) {
        const userTwins = await database_1.twinQueries.findByUserId(req.user.id);
        if (userTwins.length > 0) {
            return res.redirect('/twin/manage');
        }
    }
    res.render('onboarding', {
        title: 'Create Your AI Twin - Enhanced Onboarding',
        user: req.user || null,
        csrfToken: res.locals['csrfToken']
    });
}
async function getMemoryManagement(req, res) {
    const user = res.locals.user || null;
    const twinId = req.query.twinId || res.locals.twinId || 'default';
    console.log('[PAGE_MEMORY_MANAGEMENT] Render data:', {
        user: user ? { id: user.id, email: user.email } : null,
        twinId,
        queryTwinId: req.query.twinId,
        localsTwinId: res.locals.twinId,
    });
    res.render('memory-management', {
        title: 'Memory Management - AI Twin',
        user,
        twinId,
        csrfToken: res.locals['csrfToken']
    });
}
//# sourceMappingURL=discoverPageController.js.map