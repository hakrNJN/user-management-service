
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
