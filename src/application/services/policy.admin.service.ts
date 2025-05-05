import { inject, injectable } from "tsyringe";
import { v4 as uuidv4 } from 'uuid';
import { Policy } from "../../domain/entities/Policy";
import { InvalidPolicySyntaxError, PolicyExistsError, PolicyNotFoundError } from "../../domain/exceptions/UserManagementError";
import { TYPES } from "../../shared/constants/types";
import { BaseError } from "../../shared/errors/BaseError";
import { AdminUser } from "../../shared/types/admin-user.interface";
import { ILogger } from "../interfaces/ILogger";
import { IPolicyAdminService } from "../interfaces/IPolicyAdminService";
import { IPolicyEngineAdapter } from "../interfaces/IPolicyEngineAdapter";
import { IPolicyRepository } from "../interfaces/IPolicyRepository";
import { QueryOptions, QueryResult } from "../interfaces/IUserProfileRepository";

@injectable()
export class PolicyAdminService implements IPolicyAdminService {

    constructor(
        @inject(TYPES.PolicyRepository) private policyRepository: IPolicyRepository,
        @inject(TYPES.PolicyEngineAdapter) private policyEngineAdapter: IPolicyEngineAdapter,
        @inject(TYPES.Logger) private logger: ILogger
    ) { }

    // Helper for authorization check (example)
    private checkAdminPermission(adminUser: AdminUser, requiredRole = 'policy-admin'): void {
        // TODO: Define appropriate admin role(s) for policy management
        if (!adminUser.roles?.includes(requiredRole) && !adminUser.roles?.includes('admin')) {
            this.logger.warn(`Admin permission check failed for policy operation`, { adminUserId: adminUser.id, requiredRole });
            throw new BaseError('ForbiddenError', 403, `Admin privileges ('${requiredRole}' or 'admin') required for this policy operation.`, true);
        }
        this.logger.debug(`Admin permission check passed for policy operation`, { adminUserId: adminUser.id, requiredRole });
    }

    async createPolicy(adminUser: AdminUser, details: {
        policyName: string;
        policyDefinition: string;
        policyLanguage: string;
        description?: string;
        version?: string;
        metadata?: Record<string, any>;
    }): Promise<Policy> {
        this.checkAdminPermission(adminUser); // Ensure user has permission
        this.logger.info(`Admin attempting to create policy: ${details.policyName}`, { adminUserId: adminUser.id });

        // 1. Check if policy with the same name already exists
        const existingByName = await this.policyRepository.findByName(details.policyName);
        if (existingByName) {
            this.logger.warn(`Policy creation failed: Name already exists - ${details.policyName}`, { adminUserId: adminUser.id });
            throw new PolicyExistsError(details.policyName);
        }

        // 2. Validate syntax using the adapter
        try {
            await this.policyEngineAdapter.validatePolicySyntax(details.policyDefinition, details.policyLanguage);
        } catch (validationError: any) {
            this.logger.warn(`Policy creation failed: Invalid syntax - ${details.policyName}`, { adminUserId: adminUser.id, error: validationError.message });
            // Re-throw specific syntax error or wrap if needed
            if (validationError instanceof InvalidPolicySyntaxError) throw validationError;
            throw new InvalidPolicySyntaxError(details.policyName, details.policyLanguage, validationError.details || validationError.message);
        }

        // 3. Create Policy entity instance
        const newPolicyId = uuidv4();
        const newPolicy = new Policy(
            newPolicyId,
            details.policyName,
            details.policyDefinition,
            details.policyLanguage,
            details.description,
            details.version,
            details.metadata,
            new Date(), // createdAt
            new Date()  // updatedAt
        );

        // 4. Publish/Save using the adapter (which uses the repository)
        try {
            await this.policyEngineAdapter.publishPolicy(newPolicy);
            this.logger.info(`Admin successfully created policy ${newPolicy.policyName} (ID: ${newPolicy.id})`, { adminUserId: adminUser.id });
            return newPolicy;
        } catch (publishError: any) {
            // Errors during publish (adapter/repo level)
            this.logger.error(`Policy creation failed during publish step: ${details.policyName}`, { adminUserId: adminUser.id, error: publishError });
            throw publishError; // Re-throw adapter/repo errors
        }
    }

    async getPolicy(adminUser: AdminUser, identifier: string): Promise<Policy | null> {
        this.checkAdminPermission(adminUser);
        this.logger.debug(`Admin attempting to get policy by identifier: ${identifier}`, { adminUserId: adminUser.id });

        let policy: Policy | null = null;
        try {
            // Try finding by ID first if it looks like a UUID
            if (identifier.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/)) {
                policy = await this.policyRepository.findById(identifier);
            }

            // If not found by ID (or identifier wasn't a UUID), try by name
            if (!policy) {
                policy = await this.policyRepository.findByName(identifier);
            }

            if (!policy) {
                this.logger.info(`Policy not found for identifier: ${identifier}`, { adminUserId: adminUser.id });
                return null;
            }

            this.logger.info(`Admin successfully retrieved policy ${policy.policyName} (ID: ${policy.id})`, { adminUserId: adminUser.id });
            return policy;
        } catch (error: any) {
            this.logger.error(`Failed to get policy by identifier ${identifier}`, { adminUserId: adminUser.id, error });
            throw error; // Re-throw repository errors
        }
    }

    async listPolicies(adminUser: AdminUser, options?: QueryOptions & { language?: string }): Promise<QueryResult<Policy>> {
        this.checkAdminPermission(adminUser);
        this.logger.info(`Admin attempting to list policies`, { adminUserId: adminUser.id, options });
        try {
            const result = await this.policyRepository.list(options);
            this.logger.info(`Admin successfully listed ${result.items.length} policies`, { adminUserId: adminUser.id });
            return result;
        } catch (error: any) {
            this.logger.error(`Failed to list policies`, { adminUserId: adminUser.id, error });
            throw error; // Re-throw repository errors
        }
    }

    async updatePolicy(adminUser: AdminUser, identifier: string, updates: {
        policyName?: string;
        description?: string;
        policyDefinition?: string;
        policyLanguage?: string;
        version?: string;
        metadata?: Record<string, any>;
    }): Promise<Policy | null> {
        this.checkAdminPermission(adminUser);
        this.logger.info(`Admin attempting to update policy: ${identifier}`, { adminUserId: adminUser.id, updates: Object.keys(updates) });

        // 1. Find the existing policy
        const existingPolicy = await this.getPolicy(adminUser, identifier);
        if (!existingPolicy) {
            this.logger.warn(`Policy update failed: Policy not found - ${identifier}`, { adminUserId: adminUser.id });
            throw new PolicyNotFoundError(identifier); // Throw not found error
        }

        // 2. Check for name collision if name is being updated
        if (updates.policyName && updates.policyName !== existingPolicy.policyName) {
            const collisionPolicy = await this.policyRepository.findByName(updates.policyName);
            if (collisionPolicy && collisionPolicy.id !== existingPolicy.id) {
                this.logger.warn(`Policy update failed: New name conflicts with existing policy - ${updates.policyName}`, { adminUserId: adminUser.id });
                throw new PolicyExistsError(updates.policyName);
            }
        }

        // 3. Validate syntax of the *new* definition if provided
        if (updates.policyDefinition !== undefined) {
            const languageToValidate = updates.policyLanguage || existingPolicy.policyLanguage;
            try {
                await this.policyEngineAdapter.validatePolicySyntax(updates.policyDefinition, languageToValidate);
            } catch (validationError: any) {
                this.logger.warn(`Policy update failed: Invalid syntax - ${existingPolicy.policyName}`, { policyId: existingPolicy.id, adminUserId: adminUser.id, error: validationError.message });
                if (validationError instanceof InvalidPolicySyntaxError) throw validationError;
                throw new InvalidPolicySyntaxError(existingPolicy.policyName, languageToValidate, validationError.details || validationError.message);
            }
        }

        // 4. Apply updates to the domain entity
        existingPolicy.update(updates); // This also updates the 'updatedAt' timestamp

        // 5. Publish/Save the updated policy using the adapter
        try {
            await this.policyEngineAdapter.publishPolicy(existingPolicy);
            this.logger.info(`Admin successfully updated policy ${existingPolicy.policyName} (ID: ${existingPolicy.id})`, { adminUserId: adminUser.id });
            return existingPolicy;
        } catch (publishError: any) {
            this.logger.error(`Policy update failed during publish step: ${existingPolicy.policyName}`, { policyId: existingPolicy.id, adminUserId: adminUser.id, error: publishError });
            throw publishError; // Re-throw adapter/repo errors
        }
    }

    async deletePolicy(adminUser: AdminUser, identifier: string): Promise<void> {
        this.checkAdminPermission(adminUser);
        this.logger.info(`Admin attempting to delete policy: ${identifier}`, { adminUserId: adminUser.id });

        // 1. Find the existing policy to get its ID (if identifier is name) and confirm existence
        const policyToDelete = await this.getPolicy(adminUser, identifier);
        if (!policyToDelete) {
            this.logger.warn(`Policy deletion failed: Policy not found - ${identifier}`, { adminUserId: adminUser.id });
            throw new PolicyNotFoundError(identifier);
        }

        // 2. Delete using the adapter (which uses the repository's delete by ID)
        try {
            await this.policyEngineAdapter.deletePolicyDefinition(policyToDelete.id);
            this.logger.info(`Admin successfully deleted policy ${policyToDelete.policyName} (ID: ${policyToDelete.id})`, { adminUserId: adminUser.id });
        } catch (deleteError: any) {
            this.logger.error(`Policy deletion failed during delete step: ${policyToDelete.policyName}`, { policyId: policyToDelete.id, adminUserId: adminUser.id, error: deleteError });
            // Re-throw specific errors like PolicyNotFoundError if adapter passes it through, or wrap others
            if (deleteError instanceof PolicyNotFoundError) throw deleteError;
            throw deleteError; // Re-throw adapter/repo errors
        }
    }
}