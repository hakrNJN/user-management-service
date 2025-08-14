import { Router } from 'express';
import { ILogger } from '../../application/interfaces/ILogger';
import { container } from '../../container';
import { TYPES } from '../../shared/constants/types';
import { PolicyAdminController } from '../controllers/policy.admin.controller';
import { createAdminAuthGuardMiddleware } from '../middlewares/admin.auth.guard.middleware';
import { jwtAuthMiddleware } from '../middlewares/jwtAuth.middleware';
import { validationMiddleware } from '../middlewares/validation.middleware';

// Import DTO Schemas
import {
    CreatePolicyAdminSchema,
    PolicyIdParamsSchema,
    PolicyVersionParamsSchema,
    RollbackPolicySchema,
    UpdatePolicyAdminSchema,
    ListPoliciesQueryAdminSchema
} from '../dtos/policy.admin.dto';

// Resolve dependencies
const policyAdminController = container.resolve(PolicyAdminController);
const logger = container.resolve<ILogger>(TYPES.Logger);
const adminGuard = createAdminAuthGuardMiddleware('policy-admin'); // Assuming 'policy-admin' is the required role

// Create router instance
const router = Router();

// Apply middleware
router.use(jwtAuthMiddleware()); // Apply JWT authentication first
router.use(adminGuard); // Then apply admin guard

// --- Policy Management Routes ---

// POST /admin/policies - Create a new policy
router.post(
    '/',
    validationMiddleware(CreatePolicyAdminSchema, logger),
    policyAdminController.createPolicy
);

// GET /admin/policies - List policies
router.get(
    '/',
    validationMiddleware(ListPoliciesQueryAdminSchema, logger),
    policyAdminController.listPolicies
);

// GET /admin/policies/:policyId - Get a specific policy (latest version)
router.get(
    '/:policyId',
    validationMiddleware(PolicyIdParamsSchema, logger),
    policyAdminController.getPolicy
);

// PUT /admin/policies/:policyId - Update a policy (creates new version)
router.put(
    '/:policyId',
    validationMiddleware(UpdatePolicyAdminSchema, logger),
    policyAdminController.updatePolicy
);

// DELETE /admin/policies/:policyId - Deactivate/Delete a policy
router.delete(
    '/:policyId',
    validationMiddleware(PolicyIdParamsSchema, logger),
    policyAdminController.deletePolicy
);

// GET /admin/policies/:policyId/versions/:version - Get a specific policy version
router.get(
    '/:policyId/versions/:version',
    validationMiddleware(PolicyVersionParamsSchema, logger),
    policyAdminController.getPolicyVersion
);

// GET /admin/policies/:policyId/versions - List all versions for a policy
router.get(
    '/:policyId/versions',
    validationMiddleware(PolicyIdParamsSchema, logger),
    policyAdminController.listPolicyVersions
);

// POST /admin/policies/:policyId/rollback/:version - Rollback a policy to a specific version
router.post(
    '/:policyId/rollback/:version',
    validationMiddleware(RollbackPolicySchema, logger),
    policyAdminController.rollbackPolicy
);

export default router;