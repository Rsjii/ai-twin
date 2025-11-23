"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHelpCenter = getHelpCenter;
exports.getContact = getContact;
exports.getPrivacy = getPrivacy;
exports.getTerms = getTerms;
const logger_1 = require("../config/logger");
async function getHelpCenter(req, res) {
    const user = res.locals.user || null;
    const hasTwins = typeof res.locals.hasTwins !== 'undefined' ? res.locals.hasTwins : false;
    const twinId = res.locals.twinId || null;
    try {
        logger_1.logger.info('[PAGE_HELP_CENTER]', {
            path: req.path,
            userFromReq: req.user
                ? { id: req.user.id, email: req.user.email, handle: req.user.handle }
                : null,
            userFromLocals: user
                ? { id: user.id, email: user.email, handle: user.handle }
                : null,
            hasTwins,
            twinId,
        });
    }
    catch (logError) {
        logger_1.logger.warn('[PAGE_HELP_CENTER] Failed to log context:', logError);
    }
    console.log('[PAGE_HELP_CENTER] Render data:', {
        user: user ? { id: user.id, email: user.email, handle: user.handle } : null,
        hasTwins,
        twinId,
        userFromReq: req.user ? { id: req.user.id, email: req.user.email } : null,
        userFromLocals: user ? { id: user.id, email: user.email } : null,
        jwtCookiePresent: !!req.cookies?.['jwtToken'],
        cookies: Object.keys(req.cookies || {}),
    });
    res.render('help-center', {
        title: 'Help Center - AI Twin',
        user,
        hasTwins,
        twinId,
        csrfToken: res.locals['csrfToken'],
    });
}
async function getContact(req, res) {
    const user = res.locals.user || null;
    const hasTwins = typeof res.locals.hasTwins !== 'undefined' ? res.locals.hasTwins : false;
    const twinId = res.locals.twinId || null;
    console.log('[PAGE_CONTACT] Render data:', {
        user: user ? { id: user.id, email: user.email, handle: user.handle } : null,
        hasTwins,
        twinId,
        userFromReq: req.user ? { id: req.user.id, email: req.user.email } : null,
        userFromLocals: user ? { id: user.id, email: user.email } : null,
        jwtCookiePresent: !!req.cookies?.['jwtToken'],
        cookies: Object.keys(req.cookies || {}),
    });
    res.render('contact', {
        title: 'Contact Us - AI Twin',
        user,
        hasTwins,
        twinId,
        csrfToken: res.locals['csrfToken'],
    });
}
async function getPrivacy(req, res) {
    const user = res.locals.user || null;
    const hasTwins = typeof res.locals.hasTwins !== 'undefined' ? res.locals.hasTwins : false;
    const twinId = res.locals.twinId || null;
    console.log('[PAGE_PRIVACY] Render data:', {
        user: user ? { id: user.id, email: user.email, handle: user.handle } : null,
        hasTwins,
        twinId,
        userFromReq: req.user ? { id: req.user.id, email: req.user.email } : null,
        userFromLocals: user ? { id: user.id, email: user.email } : null,
        jwtCookiePresent: !!req.cookies?.['jwtToken'],
        cookies: Object.keys(req.cookies || {}),
    });
    res.render('privacy', {
        title: 'Privacy Policy - AI Twin',
        user,
        hasTwins,
        twinId,
        csrfToken: res.locals['csrfToken'],
    });
}
async function getTerms(req, res) {
    const user = res.locals.user || null;
    const hasTwins = typeof res.locals.hasTwins !== 'undefined' ? res.locals.hasTwins : false;
    const twinId = res.locals.twinId || null;
    console.log('[PAGE_TERMS] Render data:', {
        user: user ? { id: user.id, email: user.email, handle: user.handle } : null,
        hasTwins,
        twinId,
        userFromReq: req.user ? { id: req.user.id, email: req.user.email } : null,
        userFromLocals: user ? { id: user.id, email: user.email } : null,
        jwtCookiePresent: !!req.cookies?.['jwtToken'],
        cookies: Object.keys(req.cookies || {}),
    });
    res.render('terms', {
        title: 'Terms of Service - AI Twin',
        user,
        hasTwins,
        twinId,
        csrfToken: res.locals['csrfToken'],
    });
}
//# sourceMappingURL=supportPageController.js.map