import { Router } from 'express';
import { extractJWTFromCookie } from '../middleware/jwtCookie';
import * as testController from '../controllers/testController';

const router = Router();

// Test route
router.get('/test', testController.testRoute);

// Test session endpoint
router.get('/test-session', testController.testSession);

// Test database route
router.get('/test-db', testController.testDatabase);

// Test auth route (no CSRF)
router.post('/test-auth', testController.testAuth);

// Test OTP generation route (no CSRF)
router.post('/test-otp', testController.testOTP);

// Very simple test page
router.get('/basic', testController.basicTest);

// Test profile route
router.get('/test-profile', extractJWTFromCookie, testController.testProfile);

export default router;

