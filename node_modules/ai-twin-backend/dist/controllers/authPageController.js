"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAuth = getAuth;
exports.getLogin = getLogin;
exports.getSignup = getSignup;
exports.getLoginVerify = getLoginVerify;
exports.getVerifyOtp = getVerifyOtp;
exports.getSignupProfile = getSignupProfile;
exports.getForgotPassword = getForgotPassword;
exports.getForgotPasswordVerify = getForgotPasswordVerify;
exports.getResetPassword = getResetPassword;
function getAuth(req, res) {
    if (req.user) {
        return res.redirect('/dashboard');
    }
    res.render('auth', {
        title: 'Login / Signup - AI Twin',
        user: null,
        csrfToken: res.locals['csrfToken'],
    });
}
function getLogin(req, res) {
    if (req.user) {
        return res.redirect('/dashboard');
    }
    res.redirect('/auth');
}
function getSignup(req, res) {
    if (req.user) {
        return res.redirect('/dashboard');
    }
    res.redirect('/auth');
}
function getLoginVerify(req, res) {
    const email = req.query['email'];
    res.render('login-verify', {
        title: 'Verify OTP - AI Twin',
        user: null,
        csrfToken: res.locals['csrfToken'],
        email: email
    });
}
function getVerifyOtp(req, res) {
    const email = req.query['email'];
    const type = req.query['type'];
    const otp = req.query['otp'];
    res.render('verify-otp', {
        title: 'Verify OTP - AI Twin',
        user: null,
        csrfToken: res.locals['csrfToken'],
        email: email,
        type: type,
        actualOTP: otp || '123456'
    });
}
function getSignupProfile(req, res) {
    const email = req.query['email'];
    res.render('signup-profile', {
        title: 'Complete Profile - AI Twin',
        user: null,
        csrfToken: res.locals['csrfToken'],
        email: email
    });
}
function getForgotPassword(req, res) {
    res.render('forgot-password', {
        title: 'Forgot Password - AI Twin',
        user: null,
        csrfToken: res.locals['csrfToken']
    });
}
function getForgotPasswordVerify(req, res) {
    const email = req.query['email'];
    res.render('forgot-password-verify', {
        title: 'Verify Reset Code - AI Twin',
        user: null,
        csrfToken: res.locals['csrfToken'],
        email: email
    });
}
function getResetPassword(req, res) {
    const email = req.query['email'];
    res.render('reset-password', {
        title: 'Reset Password - AI Twin',
        user: null,
        csrfToken: res.locals['csrfToken'],
        email: email
    });
}
//# sourceMappingURL=authPageController.js.map