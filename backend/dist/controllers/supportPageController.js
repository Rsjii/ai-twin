"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHelpCenter = getHelpCenter;
exports.getContact = getContact;
exports.getPrivacy = getPrivacy;
exports.getTerms = getTerms;
function getHelpCenter(req, res) {
    res.render('help-center', {
        title: 'Help Center - AI Twin',
        user: req.user,
        csrfToken: res.locals['csrfToken'],
    });
}
function getContact(req, res) {
    res.render('contact', {
        title: 'Contact Us - AI Twin',
        user: req.user,
        csrfToken: res.locals['csrfToken'],
    });
}
function getPrivacy(req, res) {
    res.render('privacy', {
        title: 'Privacy Policy - AI Twin',
        user: req.user,
        csrfToken: res.locals['csrfToken'],
    });
}
function getTerms(req, res) {
    res.render('terms', {
        title: 'Terms of Service - AI Twin',
        user: req.user,
        csrfToken: res.locals['csrfToken'],
    });
}
//# sourceMappingURL=supportPageController.js.map