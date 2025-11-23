"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateCSRF = exports.generateCSRFToken = void 0;
const crypto_1 = __importDefault(require("crypto"));
const generateCSRFToken = (req, res, next) => {
    if (!req.session?.csrfToken) {
        req.session.csrfToken = crypto_1.default.randomBytes(32).toString('hex');
    }
    res.locals.csrfToken = req.session.csrfToken;
    next();
};
exports.generateCSRFToken = generateCSRFToken;
const validateCSRF = (req, res, next) => {
    const token = req.headers['x-csrf-token'];
    if (token) {
        console.log('CSRF token provided:', token);
    }
    else {
        console.log('No CSRF token provided, allowing request');
    }
    next();
};
exports.validateCSRF = validateCSRF;
//# sourceMappingURL=csrf.js.map