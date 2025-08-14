import 'reflect-metadata'; // Must be first
import { ILogger } from '../../../../../src/application/interfaces/ILogger';
import { IPolicyRepository } from '../../../../../src/application/interfaces/IPolicyRepository';
import { Policy } from '../../../../../src/domain/entities/Policy';
import { InvalidPolicySyntaxError, PolicyEngineAdapterError, PolicyNotFoundError } from '../../../../../src/domain/exceptions/UserManagementError';
import { DynamoDbPolicyEngineAdapter } from '../../../../../src/infrastructure/adapters/policy-engine/DynamoDbPolicyEngineAdapter'; // Adjust path
import { mockLogger } from '../../../../mocks/logger.mock'; // Adjust path
import { mockPolicyRepository } from '../../../../mocks/repository.mock'; // Adjust path

describe('DynamoDbPolicyEngineAdapter', () => {
    let adapter: DynamoDbPolicyEngineAdapter;
    let policyRepository: jest.Mocked<IPolicyRepository>;
    let logger: jest.Mocked<ILogger>;

    const testPolicyId = 'policy-uuid-adapter-test';
    const testPolicyName = 'policy.adapter.test';
    const testPolicyDefinition = 'package test\ndefault allow = false';
    const testPolicyLanguage = 'rego';
    const testPolicy = new Policy(testPolicyId, testPolicyName, testPolicyDefinition, testPolicyLanguage, 1);

    beforeEach(() => {
        jest.clearAllMocks();
        policyRepository = { ...mockPolicyRepository } as jest.Mocked<IPolicyRepository>;
        logger = { ...mockLogger } as jest.Mocked<ILogger>;
        adapter = new DynamoDbPolicyEngineAdapter(policyRepository, logger);
    });

    // --- publishPolicy Tests ---
    describe('publishPolicy', () => {
        it('should call validatePolicySyntax and policyRepository.save on success', async () => {
            // Arrange: Mock validate (placeholder) and save to succeed
            // No need to mock validate explicitly if its current implementation just logs/resolves
            policyRepository.save.mockResolvedValue(undefined);
            const validateSpy = jest.spyOn(adapter, 'validatePolicySyntax'); // Spy on validate

            // Act
            await adapter.publishPolicy(testPolicy);

            // Assert
            expect(validateSpy).toHaveBeenCalledWith(testPolicy.policyDefinition, testPolicy.policyLanguage);
            expect(policyRepository.save).toHaveBeenCalledWith(testPolicy);
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Successfully published policy'), expect.any(Object));
        });

        it('should throw InvalidPolicySyntaxError if validatePolicySyntax fails', async () => {
            // Arrange: Mock validate to fail
            const syntaxError = new InvalidPolicySyntaxError(testPolicyName, testPolicyLanguage);
            // We need to mock the *adapter's own method* for this specific test
             const validateSpy = jest.spyOn(adapter, 'validatePolicySyntax')
                                    .mockRejectedValue(syntaxError);

            // Act & Assert
            await expect(adapter.publishPolicy(testPolicy)).rejects.toThrow(InvalidPolicySyntaxError);
            expect(validateSpy).toHaveBeenCalledWith(testPolicy.policyDefinition, testPolicy.policyLanguage);
            expect(policyRepository.save).not.toHaveBeenCalled(); // Save should not be called
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error publishing policy'), expect.any(Object));
        });

        it('should wrap and throw PolicyEngineAdapterError if repository save fails', async () => {
            // Arrange: Mock validate succeeds, repo save fails
            const repoError = new Error('DynamoDB save error');
            policyRepository.save.mockRejectedValue(repoError);
            const validateSpy = jest.spyOn(adapter, 'validatePolicySyntax').mockResolvedValue(undefined);

            // Act & Assert
            await expect(adapter.publishPolicy(testPolicy)).rejects.toThrow(PolicyEngineAdapterError);
            await expect(adapter.publishPolicy(testPolicy)).rejects.toThrow(/DynamoDB save error/); // Check wrapped message

            expect(validateSpy).toHaveBeenCalled();
            expect(policyRepository.save).toHaveBeenCalledWith(testPolicy);
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error publishing policy'), expect.any(Object));
        });
    });

    // --- getPolicyDefinition Tests ---
    describe('getPolicyDefinition', () => {
        it('should call repository findById and return policyDefinition if found', async () => {
            policyRepository.findById.mockResolvedValue(testPolicy);
            const definition = await adapter.getPolicyDefinition(testPolicyId);
            expect(definition).toBe(testPolicyDefinition);
            expect(policyRepository.findById).toHaveBeenCalledWith(testPolicyId);
        });

        it('should return null if repository findById returns null', async () => {
            policyRepository.findById.mockResolvedValue(null);
            const definition = await adapter.getPolicyDefinition(testPolicyId);
            expect(definition).toBeNull();
            expect(policyRepository.findById).toHaveBeenCalledWith(testPolicyId);
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Policy definition not found'), expect.any(Object));
        });

        it('should wrap and throw PolicyEngineAdapterError if repository findById fails', async () => {
            const repoError = new Error('DynamoDB find error');
            policyRepository.findById.mockRejectedValue(repoError);

            await expect(adapter.getPolicyDefinition(testPolicyId)).rejects.toThrow(PolicyEngineAdapterError);
            await expect(adapter.getPolicyDefinition(testPolicyId)).rejects.toThrow(/DynamoDB find error/);
            expect(policyRepository.findById).toHaveBeenCalledWith(testPolicyId);
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error retrieving policy definition'), expect.any(Object));
        });
    });

    // --- deletePolicyDefinition Tests ---
    describe('deletePolicyDefinition', () => {
        it('should call repository delete and succeed if delete returns true', async () => {
            policyRepository.delete.mockResolvedValue(true);
            await expect(adapter.deletePolicyDefinition(testPolicyId)).resolves.toBeUndefined();
            expect(policyRepository.delete).toHaveBeenCalledWith(testPolicyId);
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Successfully deleted policy definition/metadata'), expect.any(Object));
        });

        it('should throw PolicyNotFoundError if repository delete returns false', async () => {
            policyRepository.delete.mockResolvedValue(false);
            await expect(adapter.deletePolicyDefinition(testPolicyId)).rejects.toThrow(PolicyNotFoundError);
            expect(policyRepository.delete).toHaveBeenCalledWith(testPolicyId);
        });

        it('should wrap and throw PolicyEngineAdapterError if repository delete fails with other error', async () => {
            const repoError = new Error('DynamoDB delete error');
            policyRepository.delete.mockRejectedValue(repoError);

            await expect(adapter.deletePolicyDefinition(testPolicyId)).rejects.toThrow(PolicyEngineAdapterError);
            await expect(adapter.deletePolicyDefinition(testPolicyId)).rejects.toThrow(/DynamoDB delete error/);
            expect(policyRepository.delete).toHaveBeenCalledWith(testPolicyId);
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error deleting policy definition'), expect.any(Object));
        });
    });

    // --- validatePolicySyntax Tests ---
    describe('validatePolicySyntax', () => {
        it('should resolve and log warning for "rego" language (placeholder)', async () => {
            await expect(adapter.validatePolicySyntax('code', 'rego')).resolves.toBeUndefined();
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Rego syntax validation is currently a placeholder'));
        });

        it('should resolve and log warning for "cedar" language (placeholder)', async () => {
            await expect(adapter.validatePolicySyntax('code', 'cedar')).resolves.toBeUndefined();
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Cedar syntax validation is not implemented'));
        });

         it('should resolve and log warning for unsupported language', async () => {
            await expect(adapter.validatePolicySyntax('code', 'fancyLang')).resolves.toBeUndefined();
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("Syntax validation for language 'fancyLang' is not supported"));
        });

        // Add tests here if/when real validation is implemented, mocking the validation library/API call
        // e.g., test that it throws InvalidPolicySyntaxError on actual failure
    });
});