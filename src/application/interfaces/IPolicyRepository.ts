import { Policy } from '../../domain/entities/Policy';
import { QueryOptions, QueryResult } from '../../shared/types/query.types';

/**
 * Defines the contract for persistence operations related to Policy metadata and definitions.
 */
export interface IPolicyRepository {
    /**
     * Creates or saves a complete policy entity. Implementations should handle potential conflicts (e.g., unique name).
     * @param policy - The Policy domain entity to save.
     * @returns A promise resolving when the operation is complete.
     * @throws {PolicyExistsError | BaseError} - If a policy with the same name/ID already exists (on create).
     */
    save(policy: Policy): Promise<void>;

    /**
     * Finds a policy by its unique ID.
     * @param policyId - The unique ID of the policy.
     * @returns A promise resolving to the Policy entity or null if not found.
     */
    findById(policyId: string): Promise<Policy | null>;

    /**
     * Finds a policy by its unique name.
     * @param policyName - The unique name of the policy.
     * @returns A promise resolving to the Policy entity or null if not found.
     */
    findByName(policyName: string): Promise<Policy | null>;

    /**
     * Lists policies based on specified criteria.
     * @param options - Pagination and filtering options (e.g., language filter).
     * @returns A promise resolving to a QueryResult containing policies.
     */
    list(options?: QueryOptions & { language?: string }): Promise<QueryResult<Policy>>;

    /**
     * Deletes a policy by its unique ID.
     * @param policyId - The unique ID of the policy to delete.
     * @returns A promise resolving to true if deleted, false if not found.
     */
    delete(policyId: string): Promise<boolean>;

    /**
     * Retrieves a specific version of a policy by its ID and version number.
     * @param policyId - The ID of the policy.
     * @param version - The specific version number to retrieve.
     * @returns A promise resolving to the Policy entity or null if not found.
     */
    getPolicyVersion(policyId: string, version: number): Promise<Policy | null>;

    /**
     * Lists all historical versions of a policy by its ID.
     * @param policyId - The ID of the policy.
     * @returns A promise resolving to an array of Policy entities, sorted by version.
     */
    listPolicyVersions(policyId: string): Promise<Policy[]>;

    /**
     * Retrieves all policies from the repository.
     * @returns A promise resolving to an array of all Policy entities.
     */
    getAllPolicies(): Promise<Policy[]>;

    // Note: Update is handled via findById/findByName + policy.update() + save() in the service layer,
    // allowing domain logic within the entity's update method. Alternatively, add an update method here
    // that takes partial updates if preferred, but ensure atomicity if needed.
}