// src/api/routes/index.ts
import { Router } from 'express';
// --- Import specific feature routers below ---
import groupAdminRouter from './group.admin.routes';
import permissionAdminRouter from './permission.admin.routes'; // <<< IMPORT
import roleAdminRouter from './role.admin.routes'; // <<< IMPORT
import systemRouter from './system.routes';
import userAdminRouter from './user.admin.routes';

const router = Router();

// --- Register feature routers here ---
// System routes (typically don't need /admin prefix or auth)
router.use('/system', systemRouter);

// Admin routes (prefixed and protected)
router.use('/admin/users', userAdminRouter);
router.use('/admin/groups', groupAdminRouter);
router.use('/admin/roles', roleAdminRouter);             // <<< REGISTER
router.use('/admin/permissions', permissionAdminRouter); // <<< REGISTER

export default router;