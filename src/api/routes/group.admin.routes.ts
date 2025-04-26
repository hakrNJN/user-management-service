import { Router } from 'express';
import { container } from '../../container';
import { GroupAdminController } from '../controllers/group.admin.controller';
import { createAdminAuthGuardMiddleware } from '../middlewares/admin.auth.guard.middleware';
import { validationMiddleware } from '../middlewares/validation.middleware';
// Import DTO Schemas
import { ILogger } from '../../application/interfaces/ILogger';
import { TYPES } from '../../shared/constants/types';
import { CreateGroupAdminSchema, GroupNameParamsSchema } from '../dtos/create-group.admin.dto';

// Resolve dependencies
const groupAdminController = container.resolve(GroupAdminController);
const logger = container.resolve<ILogger>(TYPES.Logger);

// Create admin guard instance
const adminGuard = createAdminAuthGuardMiddleware('admin'); // <<< Specify required role/group name

// Create router instance
const router = Router();

// Apply admin guard to all routes
router.use(adminGuard);

// --- Group Management Routes ---

// POST /admin/groups - Create Group
router.post(
    '/',
    validationMiddleware(CreateGroupAdminSchema, logger),
    groupAdminController.createGroup
);

// GET /admin/groups - List Groups
router.get(
    '/',
    // Add query param validation if needed (e.g., for pagination)
    groupAdminController.listGroups
);

// GET /admin/groups/:groupName - Get Group Details
router.get(
    '/:groupName',
    validationMiddleware(GroupNameParamsSchema, logger), // Validate groupName param
    groupAdminController.getGroup
);

// DELETE /admin/groups/:groupName - Delete Group
router.delete(
    '/:groupName',
    validationMiddleware(GroupNameParamsSchema, logger), // Validate groupName param
    groupAdminController.deleteGroup
);

// GET /admin/groups/:groupName/users - List Users in Group (Moved to user.admin.routes.ts for resource consistency)
// This endpoint is handled in user.admin.routes.ts as GET /admin/groups/:groupName/users

export default router;
