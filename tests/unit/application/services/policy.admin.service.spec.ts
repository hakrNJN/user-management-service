import 'reflect-metadata'; // Must be first
import { v4 as uuidv4 } from 'uuid';
import { ILogger } from '../../../../src/application/interfaces/ILogger';
import { IPolicyEngineAdapter } from '../../../../src/application/interfaces/IPolicyEngineAdapter';
import { IPolicyRepository } from '../../../../src/application/interfaces/IPolicyRepository';
import { PolicyAdminService } from '../../../../src/application/services/policy.admin.service'; // Adjust path
import { Policy } from '../../../../src/domain/entities/Policy'; // Adjust path
import { InvalidPolicySyntaxError, PolicyEngineAdapterError, PolicyExistsError, PolicyNotFoundError } from '../../../../src/domain/exceptions/UserManagementError'; // Adjust path
import { BaseError } from '../../../../src/shared/errors/BaseError';
import { AdminUser } from '../../../../src/shared/types/admin-user.interface'; // Adjust path
import { mockAdminUser, mockNonAdminUser } from '../../../mocks/adminUser.mock'; // Adjust path
import { mockLogger } from '../../../mocks/logger.mock'; // Adjust path
import { mockPolicyEngineAdapter, mockPolicyRepository } from '../../../mocks/repository.mock'; // Adjust path (assuming policy mocks added to repository.mock.ts)

// Mock uuid
jest.mock('uuid', () => ({
    v4: jest.fn(),
}));

describe('PolicyAdminService', () => {
    let service: PolicyAdminService;
    let policyRepository: jest.Mocked<IPolicyRepository>;
    let policyEngineAdapter: jest.Mocked<IPolicyEngineAdapter>;
    let logger: jest.Mocked<ILogger>;

    const testAdmin: AdminUser = { ...mockAdminUser, roles: ['policy-admin'] }; // Ensure correct role for tests
    const testNonAdmin: AdminUser = { ...mockNonAdminUser }; // User without policy-admin role

    beforeEach(() => {
        jest.clearAllMocks();
        policyRepository = { ...mockPolicyRepository } as jest.Mocked<IPolicyRepository>;
        policyEngineAdapter = { ...mockPolicyEngineAdapter } as jest.Mocked<IPolicyEngineAdapter>;
        logger = { ...mockLogger } as jest.Mocked<ILogger>;

        service = new PolicyAdminService(policyRepository, policyEngineAdapter, logger);

        // Setup default return value for uuid
        (uuidv4 as jest.Mock).mockReturnValue('mock-policy-uuid');
    });

    // --- createPolicy Tests ---
    describe('createPolicy', () => {
        const createDetails = {
            policyName: 'policy.create.test',
            policyDefinition: 'package test\ndefault allow = false',
            policyLanguage: 'rego',
            description: 'Test creation',
        };
        const expectedNewPolicy = new Policy(
            'mock-policy-uuid', // From mocked uuidv4
            createDetails.policyName,
            createDetails.policyDefinition,
            createDetails.policyLanguage,
            1, // version
            createDetails.description
        );

        it('should validate name, syntax, publish and return new policy on success', async () => {
            policyRepository.findByName.mockResolvedValue(null); // Name is unique
            policyEngineAdapter.validatePolicySyntax.mockResolvedValue(undefined); // Syntax is valid
            policyEngineAdapter.publishPolicy.mockResolvedValue(undefined); // Publish succeeds

            const result = await service.createPolicy(testAdmin, createDetails);

            expect(result).toBeInstanceOf(Policy);
            expect(result.id).toBe('mock-policy-uuid');
            expect(result.policyName).toBe(createDetails.policyName);
            expect(policyRepository.findByName).toHaveBeenCalledWith(createDetails.policyName);
            expect(policyEngineAdapter.validatePolicySyntax).toHaveBeenCalledWith(createDetails.policyDefinition, createDetails.policyLanguage);
            expect(policyEngineAdapter.publishPolicy).toHaveBeenCalledWith(expect.objectContaining({
                id: 'mock-policy-uuid',
                policyName: createDetails.policyName,
            }));
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('successfully created policy'), expect.any(Object));
        });

        it('should throw ForbiddenError if user lacks permission', async () => {
            await expect(service.createPolicy(testNonAdmin, createDetails))
                .rejects.toThrow(BaseError);
            await expect(service.createPolicy(testNonAdmin, createDetails))
                .rejects.toHaveProperty('statusCode', 403);
            expect(policyRepository.findByName).not.toHaveBeenCalled();
        });

        it('should throw PolicyExistsError if name already exists', async () => {
            policyRepository.findByName.mockResolvedValue(expectedNewPolicy); // Simulate name exists

            await expect(service.createPolicy(testAdmin, createDetails))
                .rejects.toThrow(PolicyExistsError);
            expect(policyEngineAdapter.validatePolicySyntax).not.toHaveBeenCalled();
            expect(policyEngineAdapter.publishPolicy).not.toHaveBeenCalled();
        });

        it('should throw InvalidPolicySyntaxError if adapter validation fails', async () => {
            policyRepository.findByName.mockResolvedValue(null);
            const syntaxError = new InvalidPolicySyntaxError(createDetails.policyName, createDetails.policyLanguage, { detail: 'bad token' });
            policyEngineAdapter.validatePolicySyntax.mockRejectedValue(syntaxError);

            await expect(service.createPolicy(testAdmin, createDetails))
                .rejects.toThrow(InvalidPolicySyntaxError);
            expect(policyEngineAdapter.publishPolicy).not.toHaveBeenCalled();
        });

        it('should throw PolicyEngineAdapterError if adapter publish fails', async () => {
            policyRepository.findByName.mockResolvedValue(null);
            policyEngineAdapter.validatePolicySyntax.mockResolvedValue(undefined);
            const publishError = new PolicyEngineAdapterError('Publish failed', 'publishPolicy');
            policyEngineAdapter.publishPolicy.mockRejectedValue(publishError);

            await expect(service.createPolicy(testAdmin, createDetails))
                .rejects.toThrow(PolicyEngineAdapterError);
        });
    });

    // --- getPolicy Tests ---
    describe('getPolicy', () => {
        const policyId = 'get-policy-uuid';
        const policyName = 'policy.get.test';
        const foundPolicy = new Policy(policyId, policyName, 'def', 'rego', 1);

        it('should return policy if found by ID', async () => {
            policyRepository.findById.mockResolvedValue(foundPolicy);
            const result = await service.getPolicy(testAdmin, policyId); // Pass UUID
            expect(result).toEqual(foundPolicy);
            expect(policyRepository.findById).toHaveBeenCalledWith(policyId);
            expect(policyRepository.findByName).not.toHaveBeenCalled();
        });

        it('should return policy if found by Name (after ID fails)', async () => {
            policyRepository.findById.mockResolvedValue(null); // Not found by ID
            policyRepository.findByName.mockResolvedValue(foundPolicy); // Found by Name
            const result = await service.getPolicy(testAdmin, policyName); // Pass Name
            expect(result).toEqual(foundPolicy);
            expect(policyRepository.findById).not.toHaveBeenCalled(); // Shouldn't be called if identifier isn't UUID format
            expect(policyRepository.findByName).toHaveBeenCalledWith(policyName);
        });

        it('should return null if policy not found by ID or Name', async () => {
            policyRepository.findById.mockResolvedValue(null);
            policyRepository.findByName.mockResolvedValue(null);
            const resultById = await service.getPolicy(testAdmin, 'non-uuid-id');
            const resultByName = await service.getPolicy(testAdmin, 'nonexistent.name');
            expect(resultById).toBeNull();
            expect(resultByName).toBeNull();
        });

        it('should throw ForbiddenError if user lacks permission', async () => {
            await expect(service.getPolicy(testNonAdmin, policyId))
                .rejects.toHaveProperty('statusCode', 403);
        });

        it('should re-throw repository errors', async () => {
            const repoError = new BaseError('DatabaseError', 500, 'DB Read Error');
            policyRepository.findById.mockRejectedValue(repoError);
            await expect(service.getPolicy(testAdmin, policyId))
                .rejects.toThrow(repoError);
        });
    });

    // --- listPolicies Tests ---
    describe('listPolicies', () => {
        const policies = [new Policy('p1', 'n1', 'd', 'l', 1), new Policy('p2', 'n2', 'd', 'l', 1)];
        const queryResult = { items: policies, lastEvaluatedKey: { PK: { S: 'p2' } } };

        it('should call repository list and return results', async () => {
            policyRepository.list.mockResolvedValue(queryResult);
            const options = { limit: 10, language: 'rego' };
            const result = await service.listPolicies(testAdmin, options);
            expect(result).toEqual(queryResult);
            expect(policyRepository.list).toHaveBeenCalledWith(options);
        });

        it('should throw ForbiddenError if user lacks permission', async () => {
            await expect(service.listPolicies(testNonAdmin))
                .rejects.toHaveProperty('statusCode', 403);
        });

        it('should re-throw repository errors', async () => {
            const repoError = new BaseError('DatabaseError', 500, 'DB List Error');
            policyRepository.list.mockRejectedValue(repoError);
            await expect(service.listPolicies(testAdmin))
                .rejects.toThrow(repoError);
        });
    });

    // --- updatePolicy Tests ---
    describe('updatePolicy', () => {
        const policyId = 'update-policy-uuid';
        const policyName = 'policy.update.test';
        const existingPolicy = new Policy(policyId, policyName, 'def', 'rego', 1, 'Old Desc');
        const updateDetails = {
            description: 'New Description',
            policyDefinition: 'package updated\ndefault allow = true',
        };
        const expectedUpdatedPolicy = new Policy(policyId, policyName, updateDetails.policyDefinition, 'rego', 2, updateDetails.description);

        // Mock getPolicy behavior for update tests
        const mockGetPolicy = jest.spyOn(service, 'getPolicy');

        beforeEach(() => {
            mockGetPolicy.mockClear(); // Clear spy calls
        });

        it('should find policy, validate syntax, publish update, and return updated policy', async () => {
            mockGetPolicy.mockResolvedValue(existingPolicy); // Found existing
            policyEngineAdapter.validatePolicySyntax.mockResolvedValue(undefined); // Syntax ok
            policyEngineAdapter.publishPolicy.mockResolvedValue(undefined); // Publish ok

            const result = await service.updatePolicy(testAdmin, policyId, updateDetails);

            expect(result).toBeInstanceOf(Policy);
            expect(result?.description).toBe(updateDetails.description);
            expect(result?.policyDefinition).toBe(updateDetails.policyDefinition);
            expect(result?.updatedAt).not.toEqual(existingPolicy.updatedAt); // Check timestamp updated
            expect(mockGetPolicy).toHaveBeenCalledWith(testAdmin, policyId);
            expect(policyEngineAdapter.validatePolicySyntax).toHaveBeenCalledWith(updateDetails.policyDefinition, existingPolicy.policyLanguage);
            expect(policyEngineAdapter.publishPolicy).toHaveBeenCalledWith(expect.objectContaining({
                id: policyId,
                description: updateDetails.description,
            }));
        });

        it('should throw ForbiddenError if user lacks permission', async () => {
            await expect(service.updatePolicy(testNonAdmin, policyId, updateDetails))
                .rejects.toHaveProperty('statusCode', 403);
        });

        it('should throw PolicyNotFoundError if policy does not exist', async () => {
            mockGetPolicy.mockResolvedValue(null); // Policy not found

            await expect(service.updatePolicy(testAdmin, policyId, updateDetails))
                .rejects.toThrow(PolicyNotFoundError);
            expect(policyEngineAdapter.validatePolicySyntax).not.toHaveBeenCalled();
            expect(policyEngineAdapter.publishPolicy).not.toHaveBeenCalled();
        });

        it('should check for name conflict if policyName is updated', async () => {
            const nameUpdateDetails = { policyName: 'new.conflicting.name' };
            const conflictingPolicy = new Policy('other-id', nameUpdateDetails.policyName, 'def', 'rego', 1);
            mockGetPolicy.mockResolvedValue(existingPolicy); // Found original
            policyRepository.findByName.mockResolvedValue(conflictingPolicy); // Found conflict

            await expect(service.updatePolicy(testAdmin, policyId, nameUpdateDetails))
                .rejects.toThrow(PolicyExistsError);
            expect(policyRepository.findByName).toHaveBeenCalledWith(nameUpdateDetails.policyName);
            expect(policyEngineAdapter.validatePolicySyntax).not.toHaveBeenCalled();
        });

        it('should NOT check for name conflict if policyName is not updated', async () => {
            mockGetPolicy.mockResolvedValue(existingPolicy);
            policyEngineAdapter.validatePolicySyntax.mockResolvedValue(undefined);
            policyEngineAdapter.publishPolicy.mockResolvedValue(undefined);

            await service.updatePolicy(testAdmin, policyId, updateDetails); // updateDetails doesn't include policyName

            expect(policyRepository.findByName).not.toHaveBeenCalled(); // Name check shouldn't happen
        });


        it('should throw InvalidPolicySyntaxError if adapter validation fails', async () => {
            mockGetPolicy.mockResolvedValue(existingPolicy);
            const syntaxError = new InvalidPolicySyntaxError(policyName, 'rego');
            policyEngineAdapter.validatePolicySyntax.mockRejectedValue(syntaxError);

            await expect(service.updatePolicy(testAdmin, policyId, updateDetails))
                .rejects.toThrow(InvalidPolicySyntaxError);
            expect(policyEngineAdapter.publishPolicy).not.toHaveBeenCalled();
        });

        it('should throw PolicyEngineAdapterError if adapter publish fails', async () => {
            mockGetPolicy.mockResolvedValue(existingPolicy);
            policyEngineAdapter.validatePolicySyntax.mockResolvedValue(undefined);
            const publishError = new PolicyEngineAdapterError('Publish failed', 'publishPolicy');
            policyEngineAdapter.publishPolicy.mockRejectedValue(publishError);

            await expect(service.updatePolicy(testAdmin, policyId, updateDetails))
                .rejects.toThrow(PolicyEngineAdapterError);
        });
    });

    // --- deletePolicy Tests ---
    describe('deletePolicy', () => {
        const policyId = 'delete-policy-uuid';
        const policyName = 'policy.delete.test';
        const existingPolicy = new Policy(policyId, policyName, 'def', 'rego', 1);

        const mockGetPolicy = jest.spyOn(service, 'getPolicy');

        beforeEach(() => {
            mockGetPolicy.mockClear();
        });

        it('should find policy and call adapter delete on success', async () => {
            mockGetPolicy.mockResolvedValue(existingPolicy);
            policyEngineAdapter.deletePolicyDefinition.mockResolvedValue(undefined);

            await service.deletePolicy(testAdmin, policyId);

            expect(mockGetPolicy).toHaveBeenCalledWith(testAdmin, policyId);
            expect(policyEngineAdapter.deletePolicyDefinition).toHaveBeenCalledWith(policyId);
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('successfully deleted policy'), expect.any(Object));
        });

        it('should throw ForbiddenError if user lacks permission', async () => {
            await expect(service.deletePolicy(testNonAdmin, policyId))
                .rejects.toHaveProperty('statusCode', 403);
        });

        it('should throw PolicyNotFoundError if policy does not exist', async () => {
            mockGetPolicy.mockResolvedValue(null); // Policy not found

            await expect(service.deletePolicy(testAdmin, policyId))
                .rejects.toThrow(PolicyNotFoundError);
            expect(policyEngineAdapter.deletePolicyDefinition).not.toHaveBeenCalled();
        });

        it('should throw PolicyNotFoundError if adapter delete throws PolicyNotFoundError', async () => {
            // Scenario where adapter checks again or repo delete fails with "not found"
            mockGetPolicy.mockResolvedValue(existingPolicy);
            const deleteNotFoundError = new PolicyNotFoundError(policyId);
            policyEngineAdapter.deletePolicyDefinition.mockRejectedValue(deleteNotFoundError);

            await expect(service.deletePolicy(testAdmin, policyId))
                .rejects.toThrow(PolicyNotFoundError);
        });

        it('should throw PolicyEngineAdapterError if adapter delete fails', async () => {
            mockGetPolicy.mockResolvedValue(existingPolicy);
            const deleteError = new PolicyEngineAdapterError('Delete failed', 'deletePolicyDefinition');
            policyEngineAdapter.deletePolicyDefinition.mockRejectedValue(deleteError);

            await expect(service.deletePolicy(testAdmin, policyId))
                .rejects.toThrow(PolicyEngineAdapterError);
        });
    });
});