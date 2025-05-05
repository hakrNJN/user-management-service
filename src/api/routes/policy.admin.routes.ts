import { Router } from 'express';
import { container } from '../../container';
import { PolicyAdminController } from '../controllers/policy.admin.controller';
import { createAdminAuthGuardMiddleware } from '../middlewares/admin.auth.guard.middleware';
import { validationMiddleware } from '../middlewares/validation.middleware';
// Import Policy DTO Schemas
import { ILogger } from '../../application/interfaces/ILogger';
import { TYPES } from '../../shared/constants/types';
import {
    CreatePolicyAdminSchema,
    ListPoliciesQueryAdminSchema,
    PolicyIdParamsSchema,
    UpdatePolicyAdminSchema,
} from '../dtos/policy.admin.dto';

// --- Resolve Dependencies ---
const policyAdminController = container.resolve(PolicyAdminController);
const logger = container.resolve<ILogger>(TYPES.Logger);
// Use a specific role or the general 'admin' role for policy management authorization
const adminGuard = createAdminAuthGuardMiddleware('policy-admin'); // Or 'admin'

// --- Create Router ---
const router = Router();

// --- Apply Middleware ---
// Apply admin guard to all policy routes
router.use(adminGuard);

// --- Define Policy Routes ---

// POST /admin/policies - Create a new policy
router.post(
    '/',
    validationMiddleware(CreatePolicyAdminSchema, logger),
    policyAdminController.createPolicy
);

// GET /admin/policies - List policies with pagination/filtering
router.get(
    '/',
    validationMiddleware(ListPoliciesQueryAdminSchema, logger), // Validate query params
    policyAdminController.listPolicies
);

// GET /admin/policies/:policyId - Get a specific policy by ID
router.get(
    '/:policyId',
    validationMiddleware(PolicyIdParamsSchema, logger), // Validate UUID format in param
    // Use PolicyIdentifierParamsSchema if allowing fetch by name via param
    policyAdminController.getPolicy
);

// PUT /admin/policies/:policyId - Update a specific policy by ID
router.put(
    '/:policyId',
    validationMiddleware(UpdatePolicyAdminSchema, logger), // Validates param and body
    policyAdminController.updatePolicy
);

// DELETE /admin/policies/:policyId - Delete a specific policy by ID
router.delete(
    '/:policyId',
    validationMiddleware(PolicyIdParamsSchema, logger), // Validate UUID format in param
    // Use PolicyIdentifierParamsSchema if allowing delete by name via param
    policyAdminController.deletePolicy
);

// --- Export Router ---
export default router;