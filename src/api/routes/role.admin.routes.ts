import { Router } from 'express';
import { container } from '../../container';
import { RoleAdminController } from '../controllers/role.admin.controller';
import { validationMiddleware } from '../middlewares/validation.middleware';
import { createAdminAuthGuardMiddleware } from '../middlewares/admin.auth.guard.middleware';
// Import DTO Schemas
import { CreateRoleAdminSchema, RoleNameParamsSchema, UpdateRoleAdminSchema, RolePermissionAssignSchema, RolePermissionUnassignSchema } from '../dtos/role-permission.admin.dto';
import { TYPES } from '../../shared/constants/types';
import { ILogger } from '../../application/interfaces/ILogger';

// Resolve dependencies
const roleAdminController = container.resolve(RoleAdminController);
const logger = container.resolve<ILogger>(TYPES.Logger);
const adminGuard = createAdminAuthGuardMiddleware('admin'); // Use appropriate role

// Create router instance
const router = Router();

// Apply admin guard to all routes
router.use(adminGuard);

// --- Role CRUD ---
router.post('/', validationMiddleware(CreateRoleAdminSchema, logger), roleAdminController.createRole);
router.get('/', roleAdminController.listRoles); // Add query validation if needed
router.get('/:roleName', validationMiddleware(RoleNameParamsSchema, logger), roleAdminController.getRole);
router.put('/:roleName', validationMiddleware(UpdateRoleAdminSchema, logger), roleAdminController.updateRole);
router.delete('/:roleName', validationMiddleware(RoleNameParamsSchema, logger), roleAdminController.deleteRole);

// --- Role <-> Permission Assignments ---
router.post('/:roleName/permissions', validationMiddleware(RolePermissionAssignSchema, logger), roleAdminController.assignPermissionToRole);
router.delete('/:roleName/permissions/:permissionName', validationMiddleware(RolePermissionUnassignSchema, logger), roleAdminController.removePermissionFromRole);
router.get('/:roleName/permissions', validationMiddleware(RoleNameParamsSchema, logger), roleAdminController.listPermissionsForRole);


export default router;
