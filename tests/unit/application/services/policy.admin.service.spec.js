"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata"); // Must be first
const uuid_1 = require("uuid");
const policy_admin_service_1 = require("../../../../src/application/services/policy.admin.service"); // Adjust path
const Policy_1 = require("../../../../src/domain/entities/Policy"); // Adjust path
const UserManagementError_1 = require("../../../../src/domain/exceptions/UserManagementError"); // Adjust path
const BaseError_1 = require("../../../../src/shared/errors/BaseError");
const adminUser_mock_1 = require("../../../mocks/adminUser.mock"); // Adjust path
const logger_mock_1 = require("../../../mocks/logger.mock"); // Adjust path
const repository_mock_1 = require("../../../mocks/repository.mock"); // Adjust path (assuming policy mocks added to repository.mock.ts)
// Mock uuid
jest.mock('uuid', () => ({
    v4: jest.fn(),
}));
describe('PolicyAdminService', () => {
    let service;
    let policyRepository;
    let policyEngineAdapter;
    let logger;
    const testAdmin = Object.assign(Object.assign({}, adminUser_mock_1.mockAdminUser), { roles: ['policy-admin'] }); // Ensure correct role for tests
    const testNonAdmin = Object.assign({}, adminUser_mock_1.mockNonAdminUser); // User without policy-admin role
    beforeEach(() => {
        jest.clearAllMocks();
        policyRepository = Object.assign({}, repository_mock_1.mockPolicyRepository);
        policyEngineAdapter = Object.assign({}, repository_mock_1.mockPolicyEngineAdapter);
        logger = Object.assign({}, logger_mock_1.mockLogger);
        service = new policy_admin_service_1.PolicyAdminService(policyRepository, policyEngineAdapter, logger);
        // Setup default return value for uuid
        uuid_1.v4.mockReturnValue('mock-policy-uuid');
    });
    // --- createPolicy Tests ---
    describe('createPolicy', () => {
        const createDetails = {
            policyName: 'policy.create.test',
            policyDefinition: 'package test\ndefault allow = false',
            policyLanguage: 'rego',
            description: 'Test creation',
        };
        const expectedNewPolicy = new Policy_1.Policy('mock-policy-uuid', // From mocked uuidv4
        createDetails.policyName, createDetails.policyDefinition, createDetails.policyLanguage, 1, // version
        createDetails.description);
        it('should validate name, syntax, publish and return new policy on success', () => __awaiter(void 0, void 0, void 0, function* () {
            policyRepository.findByName.mockResolvedValue(null); // Name is unique
            policyEngineAdapter.validatePolicySyntax.mockResolvedValue(undefined); // Syntax is valid
            policyEngineAdapter.publishPolicy.mockResolvedValue(undefined); // Publish succeeds
            const result = yield service.createPolicy(testAdmin, createDetails);
            expect(result).toBeInstanceOf(Policy_1.Policy);
            expect(result.id).toBe('mock-policy-uuid');
            expect(result.policyName).toBe(createDetails.policyName);
            expect(policyRepository.findByName).toHaveBeenCalledWith(createDetails.policyName);
            expect(policyEngineAdapter.validatePolicySyntax).toHaveBeenCalledWith(createDetails.policyDefinition, createDetails.policyLanguage);
            expect(policyEngineAdapter.publishPolicy).toHaveBeenCalledWith(expect.objectContaining({
                id: 'mock-policy-uuid',
                policyName: createDetails.policyName,
            }));
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('successfully created policy'), expect.any(Object));
        }));
        it('should throw ForbiddenError if user lacks permission', () => __awaiter(void 0, void 0, void 0, function* () {
            yield expect(service.createPolicy(testNonAdmin, createDetails))
                .rejects.toThrow(BaseError_1.BaseError);
            yield expect(service.createPolicy(testNonAdmin, createDetails))
                .rejects.toHaveProperty('statusCode', 403);
            expect(policyRepository.findByName).not.toHaveBeenCalled();
        }));
        it('should throw PolicyExistsError if name already exists', () => __awaiter(void 0, void 0, void 0, function* () {
            policyRepository.findByName.mockResolvedValue(expectedNewPolicy); // Simulate name exists
            yield expect(service.createPolicy(testAdmin, createDetails))
                .rejects.toThrow(UserManagementError_1.PolicyExistsError);
            expect(policyEngineAdapter.validatePolicySyntax).not.toHaveBeenCalled();
            expect(policyEngineAdapter.publishPolicy).not.toHaveBeenCalled();
        }));
        it('should throw InvalidPolicySyntaxError if adapter validation fails', () => __awaiter(void 0, void 0, void 0, function* () {
            policyRepository.findByName.mockResolvedValue(null);
            const syntaxError = new UserManagementError_1.InvalidPolicySyntaxError(createDetails.policyName, createDetails.policyLanguage, { detail: 'bad token' });
            policyEngineAdapter.validatePolicySyntax.mockRejectedValue(syntaxError);
            yield expect(service.createPolicy(testAdmin, createDetails))
                .rejects.toThrow(UserManagementError_1.InvalidPolicySyntaxError);
            expect(policyEngineAdapter.publishPolicy).not.toHaveBeenCalled();
        }));
        it('should throw PolicyEngineAdapterError if adapter publish fails', () => __awaiter(void 0, void 0, void 0, function* () {
            policyRepository.findByName.mockResolvedValue(null);
            policyEngineAdapter.validatePolicySyntax.mockResolvedValue(undefined);
            const publishError = new UserManagementError_1.PolicyEngineAdapterError('Publish failed', 'publishPolicy');
            policyEngineAdapter.publishPolicy.mockRejectedValue(publishError);
            yield expect(service.createPolicy(testAdmin, createDetails))
                .rejects.toThrow(UserManagementError_1.PolicyEngineAdapterError);
        }));
    });
    // --- getPolicy Tests ---
    describe('getPolicy', () => {
        const policyId = 'get-policy-uuid';
        const policyName = 'policy.get.test';
        const foundPolicy = new Policy_1.Policy(policyId, policyName, 'def', 'rego', 1);
        it('should return policy if found by ID', () => __awaiter(void 0, void 0, void 0, function* () {
            policyRepository.findById.mockResolvedValue(foundPolicy);
            const result = yield service.getPolicy(testAdmin, policyId); // Pass UUID
            expect(result).toEqual(foundPolicy);
            expect(policyRepository.findById).toHaveBeenCalledWith(policyId);
            expect(policyRepository.findByName).not.toHaveBeenCalled();
        }));
        it('should return policy if found by Name (after ID fails)', () => __awaiter(void 0, void 0, void 0, function* () {
            policyRepository.findById.mockResolvedValue(null); // Not found by ID
            policyRepository.findByName.mockResolvedValue(foundPolicy); // Found by Name
            const result = yield service.getPolicy(testAdmin, policyName); // Pass Name
            expect(result).toEqual(foundPolicy);
            expect(policyRepository.findById).not.toHaveBeenCalled(); // Shouldn't be called if identifier isn't UUID format
            expect(policyRepository.findByName).toHaveBeenCalledWith(policyName);
        }));
        it('should return null if policy not found by ID or Name', () => __awaiter(void 0, void 0, void 0, function* () {
            policyRepository.findById.mockResolvedValue(null);
            policyRepository.findByName.mockResolvedValue(null);
            const resultById = yield service.getPolicy(testAdmin, 'non-uuid-id');
            const resultByName = yield service.getPolicy(testAdmin, 'nonexistent.name');
            expect(resultById).toBeNull();
            expect(resultByName).toBeNull();
        }));
        it('should throw ForbiddenError if user lacks permission', () => __awaiter(void 0, void 0, void 0, function* () {
            yield expect(service.getPolicy(testNonAdmin, policyId))
                .rejects.toHaveProperty('statusCode', 403);
        }));
        it('should re-throw repository errors', () => __awaiter(void 0, void 0, void 0, function* () {
            const repoError = new BaseError_1.BaseError('DatabaseError', 500, 'DB Read Error');
            policyRepository.findById.mockRejectedValue(repoError);
            yield expect(service.getPolicy(testAdmin, policyId))
                .rejects.toThrow(repoError);
        }));
    });
    // --- listPolicies Tests ---
    describe('listPolicies', () => {
        const policies = [new Policy_1.Policy('p1', 'n1', 'd', 'l', 1), new Policy_1.Policy('p2', 'n2', 'd', 'l', 1)];
        const queryResult = { items: policies, lastEvaluatedKey: { PK: { S: 'p2' } } };
        it('should call repository list and return results', () => __awaiter(void 0, void 0, void 0, function* () {
            policyRepository.list.mockResolvedValue(queryResult);
            const options = { limit: 10, language: 'rego' };
            const result = yield service.listPolicies(testAdmin, options);
            expect(result).toEqual(queryResult);
            expect(policyRepository.list).toHaveBeenCalledWith(options);
        }));
        it('should throw ForbiddenError if user lacks permission', () => __awaiter(void 0, void 0, void 0, function* () {
            yield expect(service.listPolicies(testNonAdmin))
                .rejects.toHaveProperty('statusCode', 403);
        }));
        it('should re-throw repository errors', () => __awaiter(void 0, void 0, void 0, function* () {
            const repoError = new BaseError_1.BaseError('DatabaseError', 500, 'DB List Error');
            policyRepository.list.mockRejectedValue(repoError);
            yield expect(service.listPolicies(testAdmin))
                .rejects.toThrow(repoError);
        }));
    });
    // --- updatePolicy Tests ---
    describe('updatePolicy', () => {
        const policyId = 'update-policy-uuid';
        const policyName = 'policy.update.test';
        const existingPolicy = new Policy_1.Policy(policyId, policyName, 'def', 'rego', 1, 'Old Desc');
        const updateDetails = {
            description: 'New Description',
            policyDefinition: 'package updated\ndefault allow = true',
        };
        const expectedUpdatedPolicy = new Policy_1.Policy(policyId, policyName, updateDetails.policyDefinition, 'rego', 2, updateDetails.description);
        // Mock getPolicy behavior for update tests
        const mockGetPolicy = jest.spyOn(service, 'getPolicy');
        beforeEach(() => {
            mockGetPolicy.mockClear(); // Clear spy calls
        });
        it('should find policy, validate syntax, publish update, and return updated policy', () => __awaiter(void 0, void 0, void 0, function* () {
            mockGetPolicy.mockResolvedValue(existingPolicy); // Found existing
            policyEngineAdapter.validatePolicySyntax.mockResolvedValue(undefined); // Syntax ok
            policyEngineAdapter.publishPolicy.mockResolvedValue(undefined); // Publish ok
            const result = yield service.updatePolicy(testAdmin, policyId, updateDetails);
            expect(result).toBeInstanceOf(Policy_1.Policy);
            expect(result === null || result === void 0 ? void 0 : result.description).toBe(updateDetails.description);
            expect(result === null || result === void 0 ? void 0 : result.policyDefinition).toBe(updateDetails.policyDefinition);
            expect(result === null || result === void 0 ? void 0 : result.updatedAt).not.toEqual(existingPolicy.updatedAt); // Check timestamp updated
            expect(mockGetPolicy).toHaveBeenCalledWith(testAdmin, policyId);
            expect(policyEngineAdapter.validatePolicySyntax).toHaveBeenCalledWith(updateDetails.policyDefinition, existingPolicy.policyLanguage);
            expect(policyEngineAdapter.publishPolicy).toHaveBeenCalledWith(expect.objectContaining({
                id: policyId,
                description: updateDetails.description,
            }));
        }));
        it('should throw ForbiddenError if user lacks permission', () => __awaiter(void 0, void 0, void 0, function* () {
            yield expect(service.updatePolicy(testNonAdmin, policyId, updateDetails))
                .rejects.toHaveProperty('statusCode', 403);
        }));
        it('should throw PolicyNotFoundError if policy does not exist', () => __awaiter(void 0, void 0, void 0, function* () {
            mockGetPolicy.mockResolvedValue(null); // Policy not found
            yield expect(service.updatePolicy(testAdmin, policyId, updateDetails))
                .rejects.toThrow(UserManagementError_1.PolicyNotFoundError);
            expect(policyEngineAdapter.validatePolicySyntax).not.toHaveBeenCalled();
            expect(policyEngineAdapter.publishPolicy).not.toHaveBeenCalled();
        }));
        it('should check for name conflict if policyName is updated', () => __awaiter(void 0, void 0, void 0, function* () {
            const nameUpdateDetails = { policyName: 'new.conflicting.name' };
            const conflictingPolicy = new Policy_1.Policy('other-id', nameUpdateDetails.policyName, 'def', 'rego', 1);
            mockGetPolicy.mockResolvedValue(existingPolicy); // Found original
            policyRepository.findByName.mockResolvedValue(conflictingPolicy); // Found conflict
            yield expect(service.updatePolicy(testAdmin, policyId, nameUpdateDetails))
                .rejects.toThrow(UserManagementError_1.PolicyExistsError);
            expect(policyRepository.findByName).toHaveBeenCalledWith(nameUpdateDetails.policyName);
            expect(policyEngineAdapter.validatePolicySyntax).not.toHaveBeenCalled();
        }));
        it('should NOT check for name conflict if policyName is not updated', () => __awaiter(void 0, void 0, void 0, function* () {
            mockGetPolicy.mockResolvedValue(existingPolicy);
            policyEngineAdapter.validatePolicySyntax.mockResolvedValue(undefined);
            policyEngineAdapter.publishPolicy.mockResolvedValue(undefined);
            yield service.updatePolicy(testAdmin, policyId, updateDetails); // updateDetails doesn't include policyName
            expect(policyRepository.findByName).not.toHaveBeenCalled(); // Name check shouldn't happen
        }));
        it('should throw InvalidPolicySyntaxError if adapter validation fails', () => __awaiter(void 0, void 0, void 0, function* () {
            mockGetPolicy.mockResolvedValue(existingPolicy);
            const syntaxError = new UserManagementError_1.InvalidPolicySyntaxError(policyName, 'rego');
            policyEngineAdapter.validatePolicySyntax.mockRejectedValue(syntaxError);
            yield expect(service.updatePolicy(testAdmin, policyId, updateDetails))
                .rejects.toThrow(UserManagementError_1.InvalidPolicySyntaxError);
            expect(policyEngineAdapter.publishPolicy).not.toHaveBeenCalled();
        }));
        it('should throw PolicyEngineAdapterError if adapter publish fails', () => __awaiter(void 0, void 0, void 0, function* () {
            mockGetPolicy.mockResolvedValue(existingPolicy);
            policyEngineAdapter.validatePolicySyntax.mockResolvedValue(undefined);
            const publishError = new UserManagementError_1.PolicyEngineAdapterError('Publish failed', 'publishPolicy');
            policyEngineAdapter.publishPolicy.mockRejectedValue(publishError);
            yield expect(service.updatePolicy(testAdmin, policyId, updateDetails))
                .rejects.toThrow(UserManagementError_1.PolicyEngineAdapterError);
        }));
    });
    // --- deletePolicy Tests ---
    describe('deletePolicy', () => {
        const policyId = 'delete-policy-uuid';
        const policyName = 'policy.delete.test';
        const existingPolicy = new Policy_1.Policy(policyId, policyName, 'def', 'rego', 1);
        const mockGetPolicy = jest.spyOn(service, 'getPolicy');
        beforeEach(() => {
            mockGetPolicy.mockClear();
        });
        it('should find policy and call adapter delete on success', () => __awaiter(void 0, void 0, void 0, function* () {
            mockGetPolicy.mockResolvedValue(existingPolicy);
            policyEngineAdapter.deletePolicyDefinition.mockResolvedValue(undefined);
            yield service.deletePolicy(testAdmin, policyId);
            expect(mockGetPolicy).toHaveBeenCalledWith(testAdmin, policyId);
            expect(policyEngineAdapter.deletePolicyDefinition).toHaveBeenCalledWith(policyId);
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('successfully deleted policy'), expect.any(Object));
        }));
        it('should throw ForbiddenError if user lacks permission', () => __awaiter(void 0, void 0, void 0, function* () {
            yield expect(service.deletePolicy(testNonAdmin, policyId))
                .rejects.toHaveProperty('statusCode', 403);
        }));
        it('should throw PolicyNotFoundError if policy does not exist', () => __awaiter(void 0, void 0, void 0, function* () {
            mockGetPolicy.mockResolvedValue(null); // Policy not found
            yield expect(service.deletePolicy(testAdmin, policyId))
                .rejects.toThrow(UserManagementError_1.PolicyNotFoundError);
            expect(policyEngineAdapter.deletePolicyDefinition).not.toHaveBeenCalled();
        }));
        it('should throw PolicyNotFoundError if adapter delete throws PolicyNotFoundError', () => __awaiter(void 0, void 0, void 0, function* () {
            // Scenario where adapter checks again or repo delete fails with "not found"
            mockGetPolicy.mockResolvedValue(existingPolicy);
            const deleteNotFoundError = new UserManagementError_1.PolicyNotFoundError(policyId);
            policyEngineAdapter.deletePolicyDefinition.mockRejectedValue(deleteNotFoundError);
            yield expect(service.deletePolicy(testAdmin, policyId))
                .rejects.toThrow(UserManagementError_1.PolicyNotFoundError);
        }));
        it('should throw PolicyEngineAdapterError if adapter delete fails', () => __awaiter(void 0, void 0, void 0, function* () {
            mockGetPolicy.mockResolvedValue(existingPolicy);
            const deleteError = new UserManagementError_1.PolicyEngineAdapterError('Delete failed', 'deletePolicyDefinition');
            policyEngineAdapter.deletePolicyDefinition.mockRejectedValue(deleteError);
            yield expect(service.deletePolicy(testAdmin, policyId))
                .rejects.toThrow(UserManagementError_1.PolicyEngineAdapterError);
        }));
    });
});
