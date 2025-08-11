
    async getPolicyVersion(adminUser: AdminUser, policyId: string, version: number): Promise<Policy | null> {
        this.checkAdminPermission(adminUser);
        this.logger.debug(`Admin attempting to get policy version ${version} for policy ID: ${policyId}`, { adminUserId: adminUser.id });
        try {
            const policy = await this.policyRepository.getPolicyVersion(policyId, version);
            if (!policy) {
                this.logger.info(`Policy version ${version} not found for policy ID: ${policyId}`, { adminUserId: adminUser.id });
                return null;
            }
            this.logger.info(`Admin successfully retrieved policy version ${version} for policy ID: ${policyId}`, { adminUserId: adminUser.id });
            return policy;
        } catch (error: any) {
            this.logger.error(`Failed to get policy version ${version} for policy ID ${policyId}`, { adminUserId: adminUser.id, error });
            throw error; // Re-throw repository errors
        }
    }

    async listPolicyVersions(adminUser: AdminUser, policyId: string): Promise<Policy[]> {
        this.checkAdminPermission(adminUser);
        this.logger.debug(`Admin attempting to list all versions for policy ID: ${policyId}`, { adminUserId: adminUser.id });
        try {
            const versions = await this.policyRepository.listPolicyVersions(policyId);
            this.logger.info(`Admin successfully listed ${versions.length} versions for policy ID: ${policyId}`, { adminUserId: adminUser.id });
            return versions;
        } catch (error: any) {
            this.logger.error(`Failed to list policy versions for policy ID ${policyId}`, { adminUserId: adminUser.id, error });
            throw error; // Re-throw repository errors
        }
    }

    async rollbackPolicy(adminUser: AdminUser, policyId: string, version: number): Promise<Policy> {
        this.checkAdminPermission(adminUser);
        this.logger.info(`Admin attempting to roll back policy ${policyId} to version ${version}`, { adminUserId: adminUser.id });

        // 3. Create Policy entity instance
        const newPolicyId = uuidv4();
        const newPolicy = new Policy(
            newPolicyId,
            details.policyName,
            details.policyDefinition,
            details.policyLanguage,
            1, // Initial version is 1
            details.description,
            details.metadata,
            new Date(), // createdAt
            new Date()  // updatedAt
        );

        // TODO: Integrate Rego policy compilation to Wasm here.
        // After saving the policy, compile it to a Wasm bundle and store it.
        // This might involve calling an external OPA compiler or a local library.

        // 4. Publish/Save using the adapter (which uses the repository)
