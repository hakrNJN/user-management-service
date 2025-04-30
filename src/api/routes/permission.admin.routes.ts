import { Router } from 'express';
import { container } from '../../container';
import { PermissionAdminController } from '../controllers/permission.admin.controller';
import { validationMiddleware } from '../middlewares/validation.middleware';
import { createAdminAuthGuardMiddleware } from '../middlewares/admin.auth.guard.middleware';
// Import DTO Schemas
import { CreatePermissionAdminSchema, PermissionNameParamsSchema, UpdatePermissionAdminSchema } from '../dtos/role-permission.admin.dto';
import { TYPES } from '../../shared/constants/types';
import { ILogger } from '../../application/interfaces/ILogger';

// Resolve dependencies
const permissionAdminController = container.resolve(PermissionAdminController);
const logger = container.resolve<ILogger>(TYPES.Logger);
const adminGuard = createAdminAuthGuardMiddleware('admin'); // Use appropriate role

// Create router instance
const router = Router();

// Apply admin guard to all routes
router.use(adminGuard);

// --- Permission CRUD ---
router.post('/', validationMiddleware(CreatePermissionAdminSchema, logger), permissionAdminController.createPermission);
router.get('/', permissionAdminController.listPermissions); // Add query validation if needed
router.get('/:permissionName', validationMiddleware(PermissionNameParamsSchema, logger), permissionAdminController.getPermission);
router.put('/:permissionName', validationMiddleware(UpdatePermissionAdminSchema, logger), permissionAdminController.updatePermission);
router.delete('/:permissionName', validationMiddleware(PermissionNameParamsSchema, logger), permissionAdminController.deletePermission);

// --- Permission -> Role Lookup ---
router.get('/:permissionName/roles', validationMiddleware(PermissionNameParamsSchema, logger), permissionAdminController.listRolesForPermission);


export default router;
