import { mock, MockProxy } from 'jest-mock-extended';
import 'reflect-metadata';
import { ILogger } from '../../../../../src/application/interfaces/ILogger';
import { IPolicyRepository } from '../../../../../src/application/interfaces/IPolicyRepository';
import { Policy } from '../../../../../src/domain/entities/Policy';
import { InvalidPolicySyntaxError, PolicyEngineAdapterError, PolicyNotFoundError } from '../../../../../src/domain/exceptions/UserManagementError';
import { DynamoDbPolicyEngineAdapter } from '../../../../../src/infrastructure/adapters/policy-engine/DynamoDbPolicyEngineAdapter';

describe('DynamoDbPolicyEngineAdapter', () => {
    let policyRepositoryMock: MockProxy<IPolicyRepository>;
    let loggerMock: MockProxy<ILogger>;
    let adapter: DynamoDbPolicyEngineAdapter;
    let validatePolicySyntaxSpy: jest.SpyInstance;

    beforeEach(() => {
        policyRepositoryMock = mock<IPolicyRepository>();
        loggerMock = mock<ILogger>();
        adapter = new DynamoDbPolicyEngineAdapter(policyRepositoryMock, loggerMock);
    });

    afterEach(() => {
        // Clean up any spies
        if (validatePolicySyntaxSpy) {
            validatePolicySyntaxSpy.mockRestore();
        }
    });

    // --- publishPolicy Tests ---
    describe('publishPolicy', () => {
        const mockPolicy = new Policy('test-tenant', 'policy-id', 'test-policy', 'rule { true }', 'rego', 1, '', {}, new Date(), new Date(), true);

        beforeEach(() => {
            // Only mock validatePolicySyntax for publishPolicy tests
            validatePolicySyntaxSpy = jest.spyOn(adapter as any, 'validatePolicySyntax').mockResolvedValue(undefined);
        });

        it('should validate syntax, save policy, and log success', async () => {
            policyRepositoryMock.save.mockResolvedValue(undefined);

            await adapter.publishPolicy(mockPolicy);

            expect(validatePolicySyntaxSpy).toHaveBeenCalledWith(mockPolicy.policyDefinition, mockPolicy.policyLanguage);
            expect(policyRepositoryMock.save).toHaveBeenCalledWith(mockPolicy);
            expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('Successfully published policy'));
        });

        it('should re-throw InvalidPolicySyntaxError if validation fails', async () => {
            const syntaxError = new InvalidPolicySyntaxError('test-policy', 'rego', ['syntax error']);
            validatePolicySyntaxSpy.mockRejectedValue(syntaxError);

            await expect(adapter.publishPolicy(mockPolicy)).rejects.toBe(syntaxError);
            expect(policyRepositoryMock.save).not.toHaveBeenCalled();
            expect(loggerMock.error).toHaveBeenCalledWith(expect.stringContaining('Error publishing policy'), expect.any(Object));
        });

        it('should throw PolicyEngineAdapterError if repository save fails', async () => {
            const dbError = new Error('DB connection failed');
            policyRepositoryMock.save.mockRejectedValue(dbError);

            await expect(adapter.publishPolicy(mockPolicy)).rejects.toBeInstanceOf(PolicyEngineAdapterError);
            expect(loggerMock.error).toHaveBeenCalledWith(expect.stringContaining('Error publishing policy'), expect.any(Object));
        });
    });

    // --- getPolicyDefinition Tests ---
    describe('getPolicyDefinition', () => {
        const policyId = 'policy-id';
        const mockPolicy = new Policy('test-tenant', policyId, 'test-policy', 'rule { true }', 'rego', 1, '', {}, new Date(), new Date(), true);

        it('should return policy definition if found', async () => {
            policyRepositoryMock.findById.mockResolvedValue(mockPolicy);

            const result = await adapter.getPolicyDefinition('test-tenant', policyId);

            expect(policyRepositoryMock.findById).toHaveBeenCalledWith(expect.any(String), policyId);
            expect(result).toBe(mockPolicy.policyDefinition);
            expect(loggerMock.debug).toHaveBeenCalledWith(expect.stringContaining('Successfully retrieved policy definition'));
        });

        it('should return null if policy not found', async () => {
            policyRepositoryMock.findById.mockResolvedValue(null);

            const result = await adapter.getPolicyDefinition('test-tenant', policyId);

            expect(policyRepositoryMock.findById).toHaveBeenCalledWith(expect.any(String), policyId);
            expect(result).toBeNull();
            expect(loggerMock.warn).toHaveBeenCalledWith(expect.stringContaining('Policy definition not found'));
        });

        it('should throw PolicyEngineAdapterError if repository find fails', async () => {
            const dbError = new Error('DB error');
            policyRepositoryMock.findById.mockRejectedValue(dbError);

            await expect(adapter.getPolicyDefinition('test-tenant', policyId)).rejects.toBeInstanceOf(PolicyEngineAdapterError);
            expect(loggerMock.error).toHaveBeenCalledWith(expect.stringContaining('Error retrieving policy definition'), expect.any(Object));
        });
    });

    // --- deletePolicyDefinition Tests ---
    describe('deletePolicyDefinition', () => {
        const policyId = 'policy-id';

        it('should delete policy and log success', async () => {
            policyRepositoryMock.delete.mockResolvedValue(true);

            await adapter.deletePolicyDefinition('test-tenant', policyId);

            expect(policyRepositoryMock.delete).toHaveBeenCalledWith(expect.any(String), policyId);
            expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('Successfully deleted policy definition'));
        });

        it('should throw PolicyNotFoundError if policy not found by repository', async () => {
            policyRepositoryMock.delete.mockResolvedValue(false);

            await expect(adapter.deletePolicyDefinition('test-tenant', policyId)).rejects.toBeInstanceOf(PolicyNotFoundError);
            expect(loggerMock.error).toHaveBeenCalledWith(expect.stringContaining('Error deleting policy definition'), expect.any(Object));
        });

        it('should throw PolicyEngineAdapterError if repository delete fails', async () => {
            const dbError = new Error('DB error');
            policyRepositoryMock.delete.mockRejectedValue(dbError);

            await expect(adapter.deletePolicyDefinition('test-tenant', policyId)).rejects.toBeInstanceOf(PolicyEngineAdapterError);
            expect(loggerMock.error).toHaveBeenCalledWith(expect.stringContaining('Error deleting policy definition'), expect.any(Object));
        });
    });

    // --- validatePolicySyntax Tests ---
    describe('validatePolicySyntax', () => {
        // Don't mock validatePolicySyntax here - test the real implementation

        it('should log warning and resolve for Rego (placeholder)', async () => {
            const policyCode = 'package example';
            const language = 'rego';

            await adapter.validatePolicySyntax(policyCode, language);

            expect(loggerMock.warn).toHaveBeenCalledWith(expect.stringContaining('Rego syntax validation is currently a placeholder'));
            expect(loggerMock.debug).toHaveBeenCalledWith(expect.stringContaining('Validating policy syntax'));
        });

        it('should log warning and resolve for Cedar (not implemented)', async () => {
            const policyCode = 'permit(principal, action, resource);';
            const language = 'cedar';

            await adapter.validatePolicySyntax(policyCode, language);

            expect(loggerMock.warn).toHaveBeenCalledWith(expect.stringContaining('Cedar syntax validation is not implemented'));
            expect(loggerMock.debug).toHaveBeenCalledWith(expect.stringContaining('Validating policy syntax'));
        });

        it('should log warning and resolve for unsupported language', async () => {
            const policyCode = 'some code';
            const language = 'unsupported';

            await adapter.validatePolicySyntax(policyCode, language);

            expect(loggerMock.warn).toHaveBeenCalledWith(expect.stringContaining('Syntax validation for language \'unsupported\' is not supported.'));
            expect(loggerMock.debug).toHaveBeenCalledWith(expect.stringContaining('Validating policy syntax'));
        });
    });
});
