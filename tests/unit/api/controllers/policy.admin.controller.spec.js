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
const jest_mock_extended_1 = require("jest-mock-extended");
require("reflect-metadata"); // Must be first for tsyringe
const tsyringe_1 = require("tsyringe"); // Use container to resolve controller
const policy_admin_controller_1 = require("../../../../src/api/controllers/policy.admin.controller"); // Adjust path
const HttpStatusCode_1 = require("../../../../src/application/enums/HttpStatusCode");
const Policy_1 = require("../../../../src/domain/entities/Policy"); // Adjust path
const UserManagementError_1 = require("../../../../src/domain/exceptions/UserManagementError"); // Adjust path
const types_1 = require("../../../../src/shared/constants/types");
const BaseError_1 = require("../../../../src/shared/errors/BaseError");
const adminUser_mock_1 = require("../../../mocks/adminUser.mock"); // Adjust path
describe('PolicyAdminController', () => {
    let controller;
    let mockPolicyAdminService;
    let mockLoggerInstance; // Renamed to avoid conflict
    let mockRequest;
    let mockResponse;
    let mockNext;
    const testAdminUser = Object.assign({}, adminUser_mock_1.mockAdminUser); // Use a copy
    beforeEach(() => {
        // Create fresh mocks for each test
        mockPolicyAdminService = (0, jest_mock_extended_1.mock)();
        mockLoggerInstance = (0, jest_mock_extended_1.mock)(); // Use the renamed mock instance
        mockRequest = (0, jest_mock_extended_1.mock)();
        mockResponse = (0, jest_mock_extended_1.mock)();
        mockNext = jest.fn();
        // Setup mock response methods
        mockResponse.status.mockReturnThis(); // Enable chaining
        mockResponse.json.mockReturnThis();
        mockResponse.send.mockReturnThis();
        // Setup default mock request properties
        mockRequest.adminUser = testAdminUser;
        mockRequest.params = {};
        mockRequest.query = {};
        mockRequest.body = {};
        // Clear container instances and register mocks for this test suite
        tsyringe_1.container.clearInstances();
        tsyringe_1.container.registerInstance(types_1.TYPES.PolicyAdminService, mockPolicyAdminService);
        tsyringe_1.container.registerInstance(types_1.TYPES.Logger, mockLoggerInstance); // Register the mock logger
        // Resolve the controller instance from the container
        controller = tsyringe_1.container.resolve(policy_admin_controller_1.PolicyAdminController);
    });
    // --- Test getAdminUser (implicitly tested in each method) ---
    it('getAdminUser check: should call next with InternalServerError if adminUser is missing', () => __awaiter(void 0, void 0, void 0, function* () {
        mockRequest.adminUser = undefined; // Simulate missing admin user
        // Expect the controller's internal check to throw
        yield controller.createPolicy(mockRequest, mockResponse, mockNext); // Use any method to trigger check
        expect(mockNext).toHaveBeenCalledWith(expect.any(BaseError_1.BaseError));
        const errorArg = mockNext.mock.calls[0][0];
        expect(errorArg.statusCode).toBe(HttpStatusCode_1.HttpStatusCode.INTERNAL_SERVER_ERROR);
        expect(errorArg.message).toContain('Admin context missing');
        expect(mockPolicyAdminService.createPolicy).not.toHaveBeenCalled();
    }));
    // --- Test createPolicy ---
    describe('createPolicy', () => {
        const createDto = {
            policyName: 'policy.test.create',
            policyDefinition: 'package test\nallow { input.user.role == "admin" }',
            policyLanguage: 'rego',
            description: 'Test policy create',
        };
        const createdPolicy = new Policy_1.Policy('policy-uuid-1', createDto.policyName, createDto.policyDefinition, createDto.policyLanguage, 1, createDto.description);
        it('should call service.createPolicy and return 201 with the created policy', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRequest.body = createDto;
            mockPolicyAdminService.createPolicy.mockResolvedValue(createdPolicy);
            yield controller.createPolicy(mockRequest, mockResponse, mockNext);
            expect(mockPolicyAdminService.createPolicy).toHaveBeenCalledWith(testAdminUser, createDto);
            expect(mockResponse.status).toHaveBeenCalledWith(HttpStatusCode_1.HttpStatusCode.CREATED);
            expect(mockResponse.json).toHaveBeenCalledWith(createdPolicy);
            expect(mockNext).not.toHaveBeenCalled();
        }));
        it('should call next with PolicyExistsError if service throws it', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRequest.body = createDto;
            const error = new UserManagementError_1.PolicyExistsError(createDto.policyName);
            mockPolicyAdminService.createPolicy.mockRejectedValue(error);
            yield controller.createPolicy(mockRequest, mockResponse, mockNext);
            expect(mockPolicyAdminService.createPolicy).toHaveBeenCalledWith(testAdminUser, createDto);
            expect(mockLoggerInstance.error).toHaveBeenCalledWith(expect.stringContaining('Failed to create policy'), expect.any(Object));
            expect(mockNext).toHaveBeenCalledWith(error);
            expect(mockResponse.status).not.toHaveBeenCalled();
        }));
        it('should call next with InvalidPolicySyntaxError if service throws it', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRequest.body = createDto;
            const error = new UserManagementError_1.InvalidPolicySyntaxError(createDto.policyName, createDto.policyLanguage, { line: 1, detail: 'parse error' });
            mockPolicyAdminService.createPolicy.mockRejectedValue(error);
            yield controller.createPolicy(mockRequest, mockResponse, mockNext);
            expect(mockNext).toHaveBeenCalledWith(error);
        }));
        it('should call next with generic error if service throws unexpectedly', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRequest.body = createDto;
            const error = new Error('Database connection failed');
            mockPolicyAdminService.createPolicy.mockRejectedValue(error);
            yield controller.createPolicy(mockRequest, mockResponse, mockNext);
            expect(mockNext).toHaveBeenCalledWith(error);
        }));
    });
    // --- Test getPolicy ---
    describe('getPolicy', () => {
        const policyId = 'policy-uuid-get';
        const foundPolicy = new Policy_1.Policy(policyId, 'policy.test.get', 'def', 'rego', 1);
        it('should call service.getPolicy and return 200 with the policy if found', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRequest.params = { policyId };
            mockPolicyAdminService.getPolicy.mockResolvedValue(foundPolicy);
            yield controller.getPolicy(mockRequest, mockResponse, mockNext);
            expect(mockPolicyAdminService.getPolicy).toHaveBeenCalledWith(testAdminUser, policyId);
            expect(mockResponse.status).toHaveBeenCalledWith(HttpStatusCode_1.HttpStatusCode.OK);
            expect(mockResponse.json).toHaveBeenCalledWith(foundPolicy);
            expect(mockNext).not.toHaveBeenCalled();
        }));
        it('should call next with PolicyNotFoundError if service returns null', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRequest.params = { policyId: 'not-found-id' };
            mockPolicyAdminService.getPolicy.mockResolvedValue(null);
            // Controller now throws PolicyNotFoundError when service returns null
            yield controller.getPolicy(mockRequest, mockResponse, mockNext);
            expect(mockPolicyAdminService.getPolicy).toHaveBeenCalledWith(testAdminUser, 'not-found-id');
            expect(mockNext).toHaveBeenCalledWith(expect.any(UserManagementError_1.PolicyNotFoundError)); // Check error type
            const errorArg = mockNext.mock.calls[0][0];
            expect(errorArg.statusCode).toBe(404);
            expect(mockResponse.status).not.toHaveBeenCalled();
        }));
        it('should call next with generic error if service throws unexpectedly', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRequest.params = { policyId };
            const error = new Error('Lookup failed');
            mockPolicyAdminService.getPolicy.mockRejectedValue(error);
            yield controller.getPolicy(mockRequest, mockResponse, mockNext);
            expect(mockPolicyAdminService.getPolicy).toHaveBeenCalledWith(testAdminUser, policyId);
            expect(mockLoggerInstance.error).toHaveBeenCalledWith(expect.stringContaining('Failed to get policy'), expect.any(Object));
            expect(mockNext).toHaveBeenCalledWith(error);
        }));
    });
    // --- Test listPolicies ---
    describe('listPolicies', () => {
        const policies = [new Policy_1.Policy('p1-id', 'p1', 'def', 'rego', 1), new Policy_1.Policy('p2-id', 'p2', 'def', 'rego', 1)];
        const queryResult = { items: policies, lastEvaluatedKey: { PK: { S: 'p2-id' } } }; // Example key
        it('should call service.listPolicies and return 200 with results', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRequest.query = { limit: '5', language: 'rego' }; // Simulate query params
            const expectedOptions = { limit: 5, language: 'rego', startKey: undefined };
            mockPolicyAdminService.listPolicies.mockResolvedValue(queryResult);
            yield controller.listPolicies(mockRequest, mockResponse, mockNext);
            expect(mockPolicyAdminService.listPolicies).toHaveBeenCalledWith(testAdminUser, expectedOptions);
            expect(mockResponse.status).toHaveBeenCalledWith(HttpStatusCode_1.HttpStatusCode.OK);
            expect(mockResponse.json).toHaveBeenCalledWith(queryResult);
            expect(mockNext).not.toHaveBeenCalled();
        }));
        it('should handle missing query parameters', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRequest.query = {};
            const emptyResult = { items: [], lastEvaluatedKey: undefined };
            const expectedOptions = { limit: undefined, language: undefined, startKey: undefined };
            mockPolicyAdminService.listPolicies.mockResolvedValue(emptyResult);
            yield controller.listPolicies(mockRequest, mockResponse, mockNext);
            expect(mockPolicyAdminService.listPolicies).toHaveBeenCalledWith(testAdminUser, expectedOptions);
            expect(mockResponse.json).toHaveBeenCalledWith(emptyResult);
        }));
        it('should call next with generic error if service throws unexpectedly', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRequest.query = {};
            const error = new Error('List failed');
            mockPolicyAdminService.listPolicies.mockRejectedValue(error);
            yield controller.listPolicies(mockRequest, mockResponse, mockNext);
            expect(mockLoggerInstance.error).toHaveBeenCalledWith(expect.stringContaining('Failed to list policies'), expect.any(Object));
            expect(mockNext).toHaveBeenCalledWith(error);
        }));
    });
    // --- Test updatePolicy ---
    describe('updatePolicy', () => {
        const policyId = 'policy-uuid-update';
        const updateDto = {
            description: 'Updated policy description',
            policyDefinition: 'package updated\nallow { input.user.email == "test@example.com" }',
        };
        const updatedPolicy = new Policy_1.Policy(policyId, 'policy.test.update', updateDto.policyDefinition, 'rego', 1, updateDto.description); // Assume name/lang not changed
        it('should call service.updatePolicy and return 200 with the updated policy', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRequest.params = { policyId };
            mockRequest.body = updateDto;
            mockPolicyAdminService.updatePolicy.mockResolvedValue(updatedPolicy);
            yield controller.updatePolicy(mockRequest, mockResponse, mockNext);
            expect(mockPolicyAdminService.updatePolicy).toHaveBeenCalledWith(testAdminUser, policyId, updateDto);
            expect(mockResponse.status).toHaveBeenCalledWith(HttpStatusCode_1.HttpStatusCode.OK);
            expect(mockResponse.json).toHaveBeenCalledWith(updatedPolicy);
            expect(mockNext).not.toHaveBeenCalled();
        }));
        it('should call next with PolicyNotFoundError if service throws it', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRequest.params = { policyId };
            mockRequest.body = updateDto;
            const error = new UserManagementError_1.PolicyNotFoundError(policyId);
            mockPolicyAdminService.updatePolicy.mockRejectedValue(error);
            yield controller.updatePolicy(mockRequest, mockResponse, mockNext);
            expect(mockPolicyAdminService.updatePolicy).toHaveBeenCalledWith(testAdminUser, policyId, updateDto);
            expect(mockLoggerInstance.error).not.toHaveBeenCalled(); // Let error middleware handle logging 404s
            expect(mockNext).toHaveBeenCalledWith(error);
            expect(mockResponse.status).not.toHaveBeenCalled();
        }));
        it('should call next with InvalidPolicySyntaxError if service throws it', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRequest.params = { policyId };
            mockRequest.body = updateDto; // Assume definition causes syntax error
            const error = new UserManagementError_1.InvalidPolicySyntaxError(policyId, 'rego');
            mockPolicyAdminService.updatePolicy.mockRejectedValue(error);
            yield controller.updatePolicy(mockRequest, mockResponse, mockNext);
            expect(mockNext).toHaveBeenCalledWith(error);
        }));
        it('should call next with generic error if service throws unexpectedly', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRequest.params = { policyId };
            mockRequest.body = updateDto;
            const error = new Error('Update DB failed');
            mockPolicyAdminService.updatePolicy.mockRejectedValue(error);
            yield controller.updatePolicy(mockRequest, mockResponse, mockNext);
            expect(mockLoggerInstance.error).toHaveBeenCalledWith(expect.stringContaining('Failed to update policy'), expect.any(Object));
            expect(mockNext).toHaveBeenCalledWith(error);
        }));
    });
    // --- Test deletePolicy ---
    describe('deletePolicy', () => {
        const policyId = 'policy-uuid-delete';
        it('should call service.deletePolicy and return 204 No Content', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRequest.params = { policyId };
            mockPolicyAdminService.deletePolicy.mockResolvedValue(undefined); // Service returns void on success
            yield controller.deletePolicy(mockRequest, mockResponse, mockNext);
            expect(mockPolicyAdminService.deletePolicy).toHaveBeenCalledWith(testAdminUser, policyId);
            expect(mockResponse.status).toHaveBeenCalledWith(HttpStatusCode_1.HttpStatusCode.NO_CONTENT);
            expect(mockResponse.send).toHaveBeenCalledTimes(1);
            expect(mockNext).not.toHaveBeenCalled();
        }));
        it('should call next with PolicyNotFoundError if service throws it', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRequest.params = { policyId };
            const error = new UserManagementError_1.PolicyNotFoundError(policyId);
            mockPolicyAdminService.deletePolicy.mockRejectedValue(error);
            yield controller.deletePolicy(mockRequest, mockResponse, mockNext);
            expect(mockPolicyAdminService.deletePolicy).toHaveBeenCalledWith(testAdminUser, policyId);
            expect(mockLoggerInstance.error).not.toHaveBeenCalled(); // Let error middleware handle logging 404s
            expect(mockNext).toHaveBeenCalledWith(error);
            expect(mockResponse.status).not.toHaveBeenCalled();
        }));
        it('should call next with generic error if service throws unexpectedly', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRequest.params = { policyId };
            const error = new Error('Delete DB failed');
            mockPolicyAdminService.deletePolicy.mockRejectedValue(error);
            yield controller.deletePolicy(mockRequest, mockResponse, mockNext);
            expect(mockLoggerInstance.error).toHaveBeenCalledWith(expect.stringContaining('Failed to delete policy'), expect.any(Object));
            expect(mockNext).toHaveBeenCalledWith(error);
        }));
    });
});
