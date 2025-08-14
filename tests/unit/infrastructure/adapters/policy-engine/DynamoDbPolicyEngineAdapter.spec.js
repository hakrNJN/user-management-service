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
const Policy_1 = require("../../../../../src/domain/entities/Policy");
const UserManagementError_1 = require("../../../../../src/domain/exceptions/UserManagementError");
const DynamoDbPolicyEngineAdapter_1 = require("../../../../../src/infrastructure/adapters/policy-engine/DynamoDbPolicyEngineAdapter"); // Adjust path
const logger_mock_1 = require("../../../../mocks/logger.mock"); // Adjust path
const repository_mock_1 = require("../../../../mocks/repository.mock"); // Adjust path
describe('DynamoDbPolicyEngineAdapter', () => {
    let adapter;
    let policyRepository;
    let logger;
    const testPolicyId = 'policy-uuid-adapter-test';
    const testPolicyName = 'policy.adapter.test';
    const testPolicyDefinition = 'package test\ndefault allow = false';
    const testPolicyLanguage = 'rego';
    const testPolicy = new Policy_1.Policy(testPolicyId, testPolicyName, testPolicyDefinition, testPolicyLanguage, 1);
    beforeEach(() => {
        jest.clearAllMocks();
        policyRepository = Object.assign({}, repository_mock_1.mockPolicyRepository);
        logger = Object.assign({}, logger_mock_1.mockLogger);
        adapter = new DynamoDbPolicyEngineAdapter_1.DynamoDbPolicyEngineAdapter(policyRepository, logger);
    });
    // --- publishPolicy Tests ---
    describe('publishPolicy', () => {
        it('should call validatePolicySyntax and policyRepository.save on success', () => __awaiter(void 0, void 0, void 0, function* () {
            // Arrange: Mock validate (placeholder) and save to succeed
            // No need to mock validate explicitly if its current implementation just logs/resolves
            policyRepository.save.mockResolvedValue(undefined);
            const validateSpy = jest.spyOn(adapter, 'validatePolicySyntax'); // Spy on validate
            // Act
            yield adapter.publishPolicy(testPolicy);
            // Assert
            expect(validateSpy).toHaveBeenCalledWith(testPolicy.policyDefinition, testPolicy.policyLanguage);
            expect(policyRepository.save).toHaveBeenCalledWith(testPolicy);
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Successfully published policy'), expect.any(Object));
        }));
        it('should throw InvalidPolicySyntaxError if validatePolicySyntax fails', () => __awaiter(void 0, void 0, void 0, function* () {
            // Arrange: Mock validate to fail
            const syntaxError = new UserManagementError_1.InvalidPolicySyntaxError(testPolicyName, testPolicyLanguage);
            // We need to mock the *adapter's own method* for this specific test
            const validateSpy = jest.spyOn(adapter, 'validatePolicySyntax')
                .mockRejectedValue(syntaxError);
            // Act & Assert
            yield expect(adapter.publishPolicy(testPolicy)).rejects.toThrow(UserManagementError_1.InvalidPolicySyntaxError);
            expect(validateSpy).toHaveBeenCalledWith(testPolicy.policyDefinition, testPolicy.policyLanguage);
            expect(policyRepository.save).not.toHaveBeenCalled(); // Save should not be called
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error publishing policy'), expect.any(Object));
        }));
        it('should wrap and throw PolicyEngineAdapterError if repository save fails', () => __awaiter(void 0, void 0, void 0, function* () {
            // Arrange: Mock validate succeeds, repo save fails
            const repoError = new Error('DynamoDB save error');
            policyRepository.save.mockRejectedValue(repoError);
            const validateSpy = jest.spyOn(adapter, 'validatePolicySyntax').mockResolvedValue(undefined);
            // Act & Assert
            yield expect(adapter.publishPolicy(testPolicy)).rejects.toThrow(UserManagementError_1.PolicyEngineAdapterError);
            yield expect(adapter.publishPolicy(testPolicy)).rejects.toThrow(/DynamoDB save error/); // Check wrapped message
            expect(validateSpy).toHaveBeenCalled();
            expect(policyRepository.save).toHaveBeenCalledWith(testPolicy);
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error publishing policy'), expect.any(Object));
        }));
    });
    // --- getPolicyDefinition Tests ---
    describe('getPolicyDefinition', () => {
        it('should call repository findById and return policyDefinition if found', () => __awaiter(void 0, void 0, void 0, function* () {
            policyRepository.findById.mockResolvedValue(testPolicy);
            const definition = yield adapter.getPolicyDefinition(testPolicyId);
            expect(definition).toBe(testPolicyDefinition);
            expect(policyRepository.findById).toHaveBeenCalledWith(testPolicyId);
        }));
        it('should return null if repository findById returns null', () => __awaiter(void 0, void 0, void 0, function* () {
            policyRepository.findById.mockResolvedValue(null);
            const definition = yield adapter.getPolicyDefinition(testPolicyId);
            expect(definition).toBeNull();
            expect(policyRepository.findById).toHaveBeenCalledWith(testPolicyId);
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Policy definition not found'), expect.any(Object));
        }));
        it('should wrap and throw PolicyEngineAdapterError if repository findById fails', () => __awaiter(void 0, void 0, void 0, function* () {
            const repoError = new Error('DynamoDB find error');
            policyRepository.findById.mockRejectedValue(repoError);
            yield expect(adapter.getPolicyDefinition(testPolicyId)).rejects.toThrow(UserManagementError_1.PolicyEngineAdapterError);
            yield expect(adapter.getPolicyDefinition(testPolicyId)).rejects.toThrow(/DynamoDB find error/);
            expect(policyRepository.findById).toHaveBeenCalledWith(testPolicyId);
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error retrieving policy definition'), expect.any(Object));
        }));
    });
    // --- deletePolicyDefinition Tests ---
    describe('deletePolicyDefinition', () => {
        it('should call repository delete and succeed if delete returns true', () => __awaiter(void 0, void 0, void 0, function* () {
            policyRepository.delete.mockResolvedValue(true);
            yield expect(adapter.deletePolicyDefinition(testPolicyId)).resolves.toBeUndefined();
            expect(policyRepository.delete).toHaveBeenCalledWith(testPolicyId);
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Successfully deleted policy definition/metadata'), expect.any(Object));
        }));
        it('should throw PolicyNotFoundError if repository delete returns false', () => __awaiter(void 0, void 0, void 0, function* () {
            policyRepository.delete.mockResolvedValue(false);
            yield expect(adapter.deletePolicyDefinition(testPolicyId)).rejects.toThrow(UserManagementError_1.PolicyNotFoundError);
            expect(policyRepository.delete).toHaveBeenCalledWith(testPolicyId);
        }));
        it('should wrap and throw PolicyEngineAdapterError if repository delete fails with other error', () => __awaiter(void 0, void 0, void 0, function* () {
            const repoError = new Error('DynamoDB delete error');
            policyRepository.delete.mockRejectedValue(repoError);
            yield expect(adapter.deletePolicyDefinition(testPolicyId)).rejects.toThrow(UserManagementError_1.PolicyEngineAdapterError);
            yield expect(adapter.deletePolicyDefinition(testPolicyId)).rejects.toThrow(/DynamoDB delete error/);
            expect(policyRepository.delete).toHaveBeenCalledWith(testPolicyId);
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error deleting policy definition'), expect.any(Object));
        }));
    });
    // --- validatePolicySyntax Tests ---
    describe('validatePolicySyntax', () => {
        it('should resolve and log warning for "rego" language (placeholder)', () => __awaiter(void 0, void 0, void 0, function* () {
            yield expect(adapter.validatePolicySyntax('code', 'rego')).resolves.toBeUndefined();
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Rego syntax validation is currently a placeholder'));
        }));
        it('should resolve and log warning for "cedar" language (placeholder)', () => __awaiter(void 0, void 0, void 0, function* () {
            yield expect(adapter.validatePolicySyntax('code', 'cedar')).resolves.toBeUndefined();
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Cedar syntax validation is not implemented'));
        }));
        it('should resolve and log warning for unsupported language', () => __awaiter(void 0, void 0, void 0, function* () {
            yield expect(adapter.validatePolicySyntax('code', 'fancyLang')).resolves.toBeUndefined();
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("Syntax validation for language 'fancyLang' is not supported"));
        }));
        // Add tests here if/when real validation is implemented, mocking the validation library/API call
        // e.g., test that it throws InvalidPolicySyntaxError on actual failure
    });
});
