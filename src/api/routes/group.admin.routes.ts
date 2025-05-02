import { Router } from 'express';
import { ILogger } from '../../application/interfaces/ILogger';
import { container } from '../../container';
import { TYPES } from '../../shared/constants/types';
import { GroupAdminController } from '../controllers/group.admin.controller';
import { createAdminAuthGuardMiddleware } from '../middlewares/admin.auth.guard.middleware';
import { validationMiddleware } from '../middlewares/validation.middleware';
// Import DTO Schemas
import { CreateGroupAdminSchema, GroupNameParamsSchema } from '../dtos/create-group.admin.dto';
// Import assignment schemas from the shared DTO file
import { GroupRoleAssignSchema, GroupRoleUnassignSchema } from '../dtos/role-permission.admin.dto';

// Resolve dependencies
const groupAdminController = container.resolve(GroupAdminController);
const logger = container.resolve<ILogger>(TYPES.Logger);
const adminGuard = createAdminAuthGuardMiddleware('admin');

// Create router instance
const router = Router();

// Apply admin guard to all group routes
router.use(adminGuard);

// --- Group Management Routes (Cognito Groups) ---

router.post( '/', validationMiddleware(CreateGroupAdminSchema, logger), groupAdminController.createGroup );
router.get( '/', groupAdminController.listGroups ); // Add pagination query validation if needed
router.get( '/:groupName', validationMiddleware(GroupNameParamsSchema, logger), groupAdminController.getGroup );
router.delete( '/:groupName', validationMiddleware(GroupNameParamsSchema, logger), groupAdminController.deleteGroup );

// --- Group <-> Role Assignment Routes (DynamoDB Assignments) ---

// Assign Role to Group: POST /admin/groups/{groupName}/roles
router.post(
    '/:groupName/roles',
    validationMiddleware(GroupRoleAssignSchema, logger), // Validates groupName param and roleName in body
    groupAdminController.assignRoleToGroup
);

// Remove Role from Group: DELETE /admin/groups/{groupName}/roles/{roleName}
router.delete(
    '/:groupName/roles/:roleName',
    validationMiddleware(GroupRoleUnassignSchema, logger), // Validates both params
    groupAdminController.removeRoleFromGroup
);

// List Roles for Group: GET /admin/groups/{groupName}/roles
router.get(
    '/:groupName/roles',
    validationMiddleware(GroupNameParamsSchema, logger), // Only need to validate groupName param
    groupAdminController.listRolesForGroup
);

// --- User membership routes moved ---
// GET /admin/groups/:groupName/users - List Users in Group (Moved to user.admin.routes.ts)

export default router;