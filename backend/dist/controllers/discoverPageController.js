"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDiscover = getDiscover;
exports.getOnboarding = getOnboarding;
exports.getMemoryManagement = getMemoryManagement;
function getDiscover(req, res) {
    res.render('discover');
}
function getOnboarding(req, res) {
    res.render('onboarding', {
        title: 'Create Your AI Twin - Enhanced Onboarding',
        user: req.user,
        csrfToken: res.locals['csrfToken']
    });
}
function getMemoryManagement(req, res) {
    res.render('memory-management', {
        title: 'Memory Management - AI Twin',
        user: req.user,
        twinId: req.query.twinId || 'default',
        csrfToken: res.locals['csrfToken']
    });
}
//# sourceMappingURL=discoverPageController.js.map