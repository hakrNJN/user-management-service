import { Policy } from '../../domain/entities/Policy';

/**
 * Defines the contract for interacting with the underlying policy storage and management system.
 * This is NOT for policy evaluation (that's the separate AuthZ service's concern).
 * This manages the lifecycle and validation of policy definitions.
 */
export interface IPolicyEngineAdapter {
    /**
     * Publishes or updates a policy definition in the underlying engine/storage.
     * This might involve writing to a file, DB, calling an API, committing to Git, etc.
     * @param policy - The Policy entity containing the definition and metadata.
     * @returns A promise resolving when the policy is successfully published/updated.
     * @throws {InvalidPolicySyntaxError | PolicyEngineAdapterError | BaseError} - On validation or publishing failure.
     */
    publishPolicy(policy: Policy): Promise<void>;

    /**
     * Retrieves the raw policy definition string for a given policy ID from the engine/storage.
     * Used potentially for display or re-validation purposes.
     * @param policyId - The unique ID of the policy.
     * @returns A promise resolving to the policy definition string, or null if not found by the adapter.
     * @throws {PolicyEngineAdapterError | BaseError}
     */
    getPolicyDefinition(tenantId: string, policyId: string): Promise<string | null>;

    /**
     * Deletes a policy definition from the underlying engine/storage.
     * @param policyId - The unique ID of the policy to delete.
     * @returns A promise resolving when the deletion is complete.
     * @throws {PolicyEngineAdapterError | BaseError}
     */
    deletePolicyDefinition(tenantId: string, policyId: string): Promise<void>;

    /**
     * Validates the syntax of a given policy code string for a specific language.
     * This might be a local check or call an external validation service/API.
     * @param policyCode - The policy code to validate.
     * @param language - The language of the policy (e.g., 'rego').
     * @returns A promise resolving if syntax is valid.
     * @throws {InvalidPolicySyntaxError} - If the syntax is invalid, potentially containing details.
     * @throws {PolicyEngineAdapterError | BaseError} - For other adapter errors.
     */
    validatePolicySyntax(policyCode: string, language: string): Promise<void>;

    // Optional: listPolicyDefinitions() if needed to sync/reconcile with external storage.
    // listPolicyDefinitions?(): Promise<Array<{ id: string; version?: string }>>;
}