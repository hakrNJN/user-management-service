import { Policy } from '../../domain/entities/Policy';
import { AdminUser } from '../../shared/types/admin-user.interface';
import { QueryOptions, QueryResult } from './IUserProfileRepository'; // Reuse pagination types

/**
 * Defines the contract for the Policy Administration application logic.
 */
export interface IPolicyAdminService {
    /**
     * Creates a new policy.
     * @param adminUser - The authenticated admin performing the action.
     * @param details - Details for the new policy (name, definition, language, etc.).
     * @returns A promise resolving to the created Policy domain entity.
     * @throws {PolicyExistsError | InvalidPolicySyntaxError | PolicyEngineAdapterError | ValidationError | BaseError}
     */
    createPolicy(adminUser: AdminUser, details: {
        policyName: string;
        policyDefinition: string;
        policyLanguage: string;
        description?: string;
        version?: string;
        metadata?: Record<string, any>;
    }): Promise<Policy>;

    /**
     * Retrieves details for a specific policy by its unique name or ID.
     * @param adminUser - The authenticated admin performing the action.
     * @param identifier - The unique name or ID of the policy.
     * @returns A promise resolving to the Policy domain entity or null if not found.
     * @throws {PolicyEngineAdapterError | BaseError}
     */
    getPolicy(adminUser: AdminUser, identifier: string): Promise<Policy | null>;

    /**
     * Lists policies based on specified criteria.
     * @param adminUser - The authenticated admin performing the action.
     * @param options - Filtering and pagination options.
     * @returns A promise resolving to the list of Policy domain entities and pagination info.
     * @throws {PolicyEngineAdapterError | BaseError}
     */
    listPolicies(adminUser: AdminUser, options?: QueryOptions & { language?: string }): Promise<QueryResult<Policy>>; // Allow filtering by language

    /**
     * Updates an existing policy.
     * @param adminUser - The authenticated admin performing the action.
     * @param identifier - The unique name or ID of the policy to update.
     * @param updates - The fields to update.
     * @returns A promise resolving to the updated Policy domain entity or null if not found.
     * @throws {PolicyNotFoundError | InvalidPolicySyntaxError | PolicyEngineAdapterError | ValidationError | BaseError}
     */
    updatePolicy(adminUser: AdminUser, identifier: string, updates: {
        policyName?: string;
        description?: string;
        policyDefinition?: string;
        policyLanguage?: string;
        version?: string;
        metadata?: Record<string, any>;
    }): Promise<Policy | null>;

    /**
     * Deletes a policy.
     * @param adminUser - The authenticated admin performing the action.
     * @param identifier - The unique name or ID of the policy to delete.
     * @returns A promise resolving upon successful deletion.
     * @throws {PolicyNotFoundError | PolicyEngineAdapterError | BaseError}
     */
    deletePolicy(adminUser: AdminUser, identifier: string): Promise<void>;
}