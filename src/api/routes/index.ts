import { Router } from 'express';
// --- Import specific feature routers below ---
import groupAdminRouter from './group.admin.routes';
import systemRouter from './system.routes'; // System routes (health, info)
import userAdminRouter from './user.admin.routes';

const router = Router();

// --- Register feature routers here ---
// System routes (typically don't need /admin prefix or auth)
router.use('/system', systemRouter);

// Admin routes (prefixed and protected)
router.use('/admin/users', userAdminRouter);
router.use('/admin/groups', groupAdminRouter);

export default router;
