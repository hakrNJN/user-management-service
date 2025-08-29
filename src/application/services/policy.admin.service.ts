
    import { inject, injectable } from 'tsyringe';
import { Policy } from '../../domain/entities/Policy';
import { PolicyNotFoundError } from '../../domain/exceptions/UserManagementError';
import { TYPES } from '../../shared/constants/types';
import { BaseError } from '../../shared/errors/BaseError';
import { AdminUser } from '../../shared/types/admin-user.interface';
import { ILogger } from '../interfaces/ILogger';
import { IPolicyAdminService } from '../interfaces/IPolicyAdminService';
import { IPolicyEngineAdapter } from '../interfaces/IPolicyEngineAdapter';
import { IPolicyRepository } from '../interfaces/IPolicyRepository';
import { QueryOptions, QueryResult } from '../../shared/types/query.types';
import { CreatePolicyAdminDto, UpdatePolicyAdminDto, ListPoliciesQueryAdminDto } from '../../api/dtos/policy.admin.dto';
import { v4 as uuidv4 } from 'uuid'; // Assuming uuid is used for new policy ID

@injectable()
export class PolicyAdminService implements IPolicyAdminService {
    constructor(
        @inject(TYPES.PolicyRepository) private policyRepository: IPolicyRepository,
        @inject(TYPES.PolicyEngineAdapter) private policyEngineAdapter: IPolicyEngineAdapter,
        @inject(TYPES.Logger) private logger: ILogger
    ) { }

    // Helper to check admin privileges (example)
    private checkAdminPermission(adminUser: AdminUser, requiredPermission: string = 'policy:admin'): void {
        if (!adminUser.roles?.includes('admin')) {
            this.logger.warn(`Admin permission check failed: User ${adminUser.username} does not have 'admin' role. Required permission: ${requiredPermission}`, { adminUserId: adminUser.id, requiredPermission });
            throw new BaseError('ForbiddenError', 403, `Admin privileges required for this operation: ${requiredPermission}.`, true);
        }
        this.logger.debug(`Admin permission check passed for ${requiredPermission}`, { adminUserId: adminUser.id, requiredPermission });
    }

    private logAuditEvent(adminUser: AdminUser, action: string, targetType: string, targetId: string, status: 'SUCCESS' | 'FAILURE', details?: any): void {
        this.logger.info(`AUDIT: Admin ${adminUser.username} performed ${action} on ${targetType} ${targetId} - ${status}`, { adminUserId: adminUser.id, action, targetType, targetId, status, details });
    }

    async createPolicy(adminUser: AdminUser, details: CreatePolicyAdminDto): Promise<Policy> {
        this.checkAdminPermission(adminUser, 'policy:create');
        this.logger.info(`Admin attempting to create policy: ${details.policyName}`, { adminUserId: adminUser.id });

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

        try {
            await this.policyRepository.save(newPolicy);
            this.logAuditEvent(adminUser, 'CREATE_POLICY', 'POLICY', newPolicy.id, 'SUCCESS', { policyName: newPolicy.policyName });
            return newPolicy;
        } catch (error: any) {
            this.logAuditEvent(adminUser, 'CREATE_POLICY', 'POLICY', newPolicyId, 'FAILURE', { policyName: details.policyName, error: error.message });
            this.logger.error(`Failed to create policy ${details.policyName}: ${error.message}`, { adminUserId: adminUser.id, error });
            throw error;
        }
    }

    async getPolicy(adminUser: AdminUser, policyId: string): Promise<Policy | null> {
        this.checkAdminPermission(adminUser, 'policy:read');
        this.logger.debug(`Admin attempting to get policy ID: ${policyId}`, { adminUserId: adminUser.id });
        try {
            const policy = await this.policyRepository.findById(policyId);
            if (!policy) {
                this.logger.info(`Policy ID: ${policyId} not found.`, { adminUserId: adminUser.id });
                return null;
            }
            this.logger.info(`Admin successfully retrieved policy ID: ${policyId}`, { adminUserId: adminUser.id });
            return policy;
        } catch (error: any) {
            this.logger.error(`Failed to get policy ID ${policyId}: ${error.message}`, { adminUserId: adminUser.id, error });
            throw error;
        }
    }

    async updatePolicy(adminUser: AdminUser, policyId: string, details: UpdatePolicyAdminDto): Promise<Policy> {
        this.checkAdminPermission(adminUser, 'policy:update');
        this.logger.info(`Admin attempting to update policy ID: ${policyId}`, { adminUserId: adminUser.id, updateDetails: details });

        const existingPolicy = await this.policyRepository.findById(policyId);
        if (!existingPolicy) {
            this.logAuditEvent(adminUser, 'UPDATE_POLICY', 'POLICY', policyId, 'FAILURE', { reason: 'Policy not found' });
            throw new PolicyNotFoundError(`Policy with ID ${policyId} not found.`);
        }

        // Create a new version of the policy
        const newPolicy = new Policy(
            existingPolicy.id, // Keep the same ID
            details.policyName ?? existingPolicy.policyName,
            details.policyDefinition ?? existingPolicy.policyDefinition,
            details.policyLanguage ?? existingPolicy.policyLanguage,
            existingPolicy.version + 1, // Increment version
            details.description ?? existingPolicy.description,
            details.metadata ?? existingPolicy.metadata,
            existingPolicy.createdAt, // Keep original creation date
            new Date()  // Update modification date
        );

        try {
            await this.policyRepository.save(newPolicy);
            this.logAuditEvent(adminUser, 'UPDATE_POLICY', 'POLICY', newPolicy.id, 'SUCCESS', { newVersion: newPolicy.version });
            return newPolicy;
        } catch (error: any) {
            this.logAuditEvent(adminUser, 'UPDATE_POLICY', 'POLICY', policyId, 'FAILURE', { error: error.message });
            this.logger.error(`Failed to update policy ${policyId}: ${error.message}`, { adminUserId: adminUser.id, error });
            throw error;
        }
    }

    async deletePolicy(adminUser: AdminUser, policyId: string): Promise<void> {
        this.checkAdminPermission(adminUser, 'policy:delete');
        this.logger.info(`Admin attempting to delete policy ID: ${policyId}`, { adminUserId: adminUser.id });

        try {
            await this.policyRepository.delete(policyId);
            this.logAuditEvent(adminUser, 'DELETE_POLICY', 'POLICY', policyId, 'SUCCESS');
        } catch (error: any) {
            this.logAuditEvent(adminUser, 'DELETE_POLICY', 'POLICY', policyId, 'FAILURE', { error: error.message });
            this.logger.error(`Failed to delete policy ${policyId}: ${error.message}`, { adminUserId: adminUser.id, error });
            throw error;
        }
    }

    async listPolicies(adminUser: AdminUser, options?: QueryOptions & { language?: string }): Promise<QueryResult<Policy>> {
        this.checkAdminPermission(adminUser, 'policy:list');
        this.logger.info(`Admin attempting to list policies with options: ${JSON.stringify(options)}`, { adminUserId: adminUser.id });

        try {
            // Assuming policyRepository.listPolicies exists and handles filtering/pagination
            // This might need to be implemented in DynamoPolicyRepository
            const result = await this.policyRepository.list(options);
            this.logger.info(`Admin successfully listed ${result.items.length} policies.`, { adminUserId: adminUser.id });
            return result;
        } catch (error: any) {
            this.logger.error(`Failed to list policies: ${error.message}`, { adminUserId: adminUser.id, error });
            throw error;
        }
    }

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
        this.checkAdminPermission(adminUser, 'policy:rollback');
        this.logger.info(`Admin attempting to roll back policy ${policyId} to version ${version}`, { adminUserId: adminUser.id });

        // 1. Get the policy version to roll back to
        const policyToRollbackTo = await this.policyRepository.getPolicyVersion(policyId, version);
        if (!policyToRollbackTo) {
            this.logAuditEvent(adminUser, 'ROLLBACK_POLICY', 'POLICY', policyId, 'FAILURE', { version, reason: 'Policy version not found' });
            throw new PolicyNotFoundError(`Policy with ID ${policyId} and version ${version} not found.`);
        }

        // 2. Create a new Policy entity instance based on the old version
        const newPolicyId = uuidv4();
        const newPolicy = new Policy(
            newPolicyId,
            policyToRollbackTo.policyName,
            policyToRollbackTo.policyDefinition,
            policyToRollbackTo.policyLanguage,
            1, // New policies always start at version 1
            policyToRollbackTo.description,
            policyToRollbackTo.metadata,
            new Date(), // createdAt
            new Date()  // updatedAt
        );

        // TODO: Integrate Rego policy compilation to Wasm here.
        // After saving the policy, compile it to a Wasm bundle and store it.
        // This might involve calling an external OPA compiler or a local library.
        // For now, we'll just save the new policy.

        // 3. Save the new policy (which effectively becomes the current active policy)
        try {
            await this.policyRepository.save(newPolicy);
            this.logAuditEvent(adminUser, 'ROLLBACK_POLICY', 'POLICY', policyId, 'SUCCESS', { newPolicyId: newPolicy.id, rolledBackToVersion: version });
            return newPolicy;
        } catch (error: any) {
            this.logAuditEvent(adminUser, 'ROLLBACK_POLICY', 'POLICY', policyId, 'FAILURE', { version, error: error.message });
            this.logger.error(`Failed to save rolled back policy for ID ${policyId} to version ${version}`, { adminUserId: adminUser.id, error });
            throw error;
        }
    }
}
