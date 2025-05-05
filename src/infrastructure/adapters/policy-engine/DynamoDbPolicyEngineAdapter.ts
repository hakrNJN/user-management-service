import { inject, injectable } from "tsyringe";
import { ILogger } from "../../../application/interfaces/ILogger";
import { IPolicyEngineAdapter } from "../../../application/interfaces/IPolicyEngineAdapter";
import { IPolicyRepository } from "../../../application/interfaces/IPolicyRepository";
import { Policy } from "../../../domain/entities/Policy";
import { InvalidPolicySyntaxError, PolicyEngineAdapterError, PolicyNotFoundError } from "../../../domain/exceptions/UserManagementError";
import { TYPES } from "../../../shared/constants/types";
// Placeholder for actual Rego validation library if integrated later
// import { /* some Rego validation function */ } from 'some-rego-validation-library';

@injectable()
export class DynamoDbPolicyEngineAdapter implements IPolicyEngineAdapter {

    constructor(
        // This adapter primarily interacts with the repository when storing policies in the DB
        @inject(TYPES.PolicyRepository) private policyRepository: IPolicyRepository,
        @inject(TYPES.Logger) private logger: ILogger
    ) { }

    async publishPolicy(policy: Policy): Promise<void> {
        const operation = 'publishPolicy';
        this.logger.info(`[${operation}] Attempting to publish policy ${policy.policyName} (ID: ${policy.id}) via DynamoDB Adapter.`);

        try {
            // 1. Validate syntax before attempting to save (placeholder validation)
            await this.validatePolicySyntax(policy.policyDefinition, policy.policyLanguage);

            // 2. Save the policy (metadata and definition) using the repository
            // The repository's save method handles create/update persistence.
            await this.policyRepository.save(policy);

            this.logger.info(`[${operation}] Successfully published policy ${policy.policyName} (ID: ${policy.id}) to repository.`);

        } catch (error: any) {
            this.logger.error(`[${operation}] Error publishing policy ${policy.policyName}`, { policyId: policy.id, error });
            if (error instanceof InvalidPolicySyntaxError) {
                throw error; // Re-throw specific validation error
            }
            // Wrap other errors (e.g., DB errors from repository) in a generic adapter error
            throw new PolicyEngineAdapterError(error.message || 'Unknown error during publish', operation, error);
        }
    }

    async getPolicyDefinition(policyId: string): Promise<string | null> {
        const operation = 'getPolicyDefinition';
        this.logger.debug(`[${operation}] Attempting to get policy definition for ID: ${policyId}`);
        try {
            const policy = await this.policyRepository.findById(policyId);
            if (!policy) {
                this.logger.warn(`[${operation}] Policy definition not found for ID: ${policyId}`);
                return null;
            }
            this.logger.debug(`[${operation}] Successfully retrieved policy definition for ID: ${policyId}`);
            return policy.policyDefinition;
        } catch (error: any) {
            this.logger.error(`[${operation}] Error retrieving policy definition`, { policyId, error });
            throw new PolicyEngineAdapterError(error.message || 'Unknown error retrieving definition', operation, error);
        }
    }

    async deletePolicyDefinition(policyId: string): Promise<void> {
        const operation = 'deletePolicyDefinition';
        this.logger.info(`[${operation}] Attempting to delete policy definition (and metadata) for ID: ${policyId}`);
        try {
            const deleted = await this.policyRepository.delete(policyId);
            if (!deleted) {
                // If the repository indicates it wasn't found, throw specific error
                throw new PolicyNotFoundError(policyId);
            }
            this.logger.info(`[${operation}] Successfully deleted policy definition/metadata for ID: ${policyId} from repository.`);
        } catch (error: any) {
            this.logger.error(`[${operation}] Error deleting policy definition`, { policyId, error });
            if (error instanceof PolicyNotFoundError) {
                throw error; // Re-throw specific not found error
            }
            throw new PolicyEngineAdapterError(error.message || 'Unknown error deleting definition', operation, error);
        }
    }

    async validatePolicySyntax(policyCode: string, language: string): Promise<void> {
        const operation = 'validatePolicySyntax';
        this.logger.debug(`[${operation}] Validating policy syntax for language: ${language}.`);

        // --- Placeholder Implementation ---
        // Actual validation depends heavily on the chosen engine and available libraries.
        // For Rego, this might involve:
        // 1. Calling an external OPA validation endpoint.
        // 2. Using a WASM build of OPA locally (can be complex).
        // 3. Using a JS/TS Rego parsing library (if one exists and is reliable).

        if (language.toLowerCase() === 'rego') {
            // Placeholder: Log a warning that actual validation is not implemented yet.
            this.logger.warn(`[${operation}] Rego syntax validation is currently a placeholder and not performing actual checks.`);
            // Example of how it *might* look if a library existed:
            /*
            try {
                // const issues = someRegoValidationFunction(policyCode);
                // if (issues && issues.length > 0) {
                //     throw new InvalidPolicySyntaxError('Placeholder Policy Name', language, issues);
                // }
                return Promise.resolve(); // Assume valid for now
            } catch (validationError: any) {
                 this.logger.error(`[${operation}] Rego validation failed`, { error: validationError });
                 if (validationError instanceof InvalidPolicySyntaxError) throw validationError;
                 throw new PolicyEngineAdapterError(`Validation check failed: ${validationError.message}`, operation, validationError);
            }
            */
            return Promise.resolve(); // Succeed for now
        } else if (language.toLowerCase() === 'cedar') {
            this.logger.warn(`[${operation}] Cedar syntax validation is not implemented.`);
            return Promise.resolve(); // Succeed for now
        } else {
            this.logger.warn(`[${operation}] Syntax validation for language '${language}' is not supported.`);
            // Optionally throw an error for unsupported languages, or just pass through
            // throw new PolicyEngineAdapterError(`Syntax validation not supported for language: ${language}`, operation);
            return Promise.resolve();
        }
    }
}