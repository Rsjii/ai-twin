import { Router } from 'express';
import authPageRoutes from './authPageRoutes';
import dashboardPageRoutes from './dashboardPageRoutes';
import profilePageRoutes from './profilePageRoutes';
import analyticsPageRoutes from './analyticsPageRoutes';
import twinPageRoutes from './twinPageRoutes';
import chatPageRoutes from './chatPageRoutes';
import discoverPageRoutes from './discoverPageRoutes';
import publicPageRoutes from './publicPageRoutes';
import supportPageRoutes from './supportPageRoutes';

const router = Router();

// Combine all page routes
router.use(authPageRoutes);
router.use(dashboardPageRoutes);
router.use(profilePageRoutes);
router.use(analyticsPageRoutes);
router.use(twinPageRoutes);
router.use(chatPageRoutes);
router.use(discoverPageRoutes);
router.use(publicPageRoutes);
router.use(supportPageRoutes);

export default router;

