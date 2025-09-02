import { Router } from 'express';
import { container } from '../../container';
import { UserAdminController } from '../controllers/user.admin.controller';
import { createAdminAuthGuardMiddleware } from '../middlewares/admin.auth.guard.middleware'; // Import admin guard factory
import { jwtAuthMiddleware } from '../middlewares/jwtAuth.middleware';
import { validationMiddleware } from '../middlewares/validation.middleware';
// Import DTO Schemas
import { AddUserToGroupAdminSchema, RemoveUserFromGroupAdminSchema } from '../dtos/add-user-to-group.admin.dto';
import { CreateUserAdminSchema } from '../dtos/create-user.admin.dto';
import { ListUsersQueryAdminSchema } from '../dtos/list-users-query.admin.dto';
import { UpdateUserAttributesAdminSchema } from '../dtos/update-user-attributes.admin.dto';
// Import other schemas if needed (e.g., for set password body)
import { z } from 'zod'; // Import Zod for simple body validation if needed
import { ILogger } from '../../application/interfaces/ILogger';
import { TYPES } from '../../shared/constants/types';

// Resolve dependencies
const userAdminController = container.resolve(UserAdminController);
const logger = container.resolve<ILogger>(TYPES.Logger);

// Create admin guard instance (assuming 'admin' is the required role/group)
const adminGuard = createAdminAuthGuardMiddleware('user-admin'); // <<< Specify required role/group name

// Create router instance
const router = Router();

// Apply admin guard to all routes in this file
router.use(jwtAuthMiddleware()); // Apply JWT authentication first
router.use(adminGuard); // Then apply admin guard

// --- User Management Routes ---

// POST /admin/users - Create User
router.post(
    '/',
    validationMiddleware(CreateUserAdminSchema, logger),
    userAdminController.createUser
);

// GET /admin/users - List Users
router.get(
    '/',
    validationMiddleware(ListUsersQueryAdminSchema, logger), // Validate query params
    userAdminController.listUsers
);

// GET /admin/users/:username - Get User Details
router.get(
    '/:username',
    // No specific DTO validation needed for params if simple string
    userAdminController.getUser
);

// PUT /admin/users/:username/attributes - Update User Attributes
router.put(
    '/:username/attributes',
    validationMiddleware(UpdateUserAttributesAdminSchema, logger),
    userAdminController.updateUserAttributes
);

// PUT /admin/users/:username/disable - Deactivate User
router.put(
    '/:username/disable',
    userAdminController.disableUser
);

// PUT /admin/users/:username/reactivate - Reactivate User
router.put(
    '/:username/reactivate',
    userAdminController.enableUser
);

// DELETE /admin/users/:username - Delete User (Permanent)
router.delete(
    '/:username',
    userAdminController.deleteUser
);

// POST /admin/users/:username/initiate-password-reset - Admin Initiate Password Reset
router.post(
    '/:username/initiate-password-reset',
    userAdminController.initiatePasswordReset
);

// POST /admin/users/:username/set-password - Admin Set Password
router.post(
    '/:username/set-password',
     // Simple inline validation for body if no specific DTO exists
     validationMiddleware(z.object({
         body: z.object({
             password: z.string().min(8), // Basic validation
             permanent: z.boolean().optional(),
         })
     }), logger),
    userAdminController.setUserPassword
);

// --- User Group Membership ---

// POST /admin/users/:username/groups - Add User to Group
router.post(
    '/:username/groups',
    validationMiddleware(AddUserToGroupAdminSchema, logger),
    userAdminController.addUserToGroup
);

// DELETE /admin/users/:username/groups/:groupName - Remove User from Group
router.delete(
    '/:username/groups/:groupName',
     validationMiddleware(RemoveUserFromGroupAdminSchema, logger), // Validate params
    userAdminController.removeUserFromGroup
);

// GET /admin/users/:username/groups - List Groups for User
router.get(
    '/:username/groups',
    userAdminController.listGroupsForUser
);


export default router;
