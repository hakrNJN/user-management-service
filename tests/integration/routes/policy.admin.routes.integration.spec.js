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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata"); // Must be first
const supertest_1 = __importDefault(require("supertest"));
// --- JEST CLASS MOCKING for Service ---
const mockPolicyAdminServiceImpl = {
    createPolicy: jest.fn(),
    getPolicy: jest.fn(),
    listPolicies: jest.fn(),
    updatePolicy: jest.fn(),
    deletePolicy: jest.fn(),
};
jest.mock('../../../src/application/services/policy.admin.service', () => ({
    PolicyAdminService: jest.fn().mockImplementation(() => mockPolicyAdminServiceImpl)
}));
// --- END JEST CLASS MOCKING ---
// --- Application Imports (AFTER MOCKS) ---
const app_1 = require("../../../src/app"); // Adjust path
const HttpStatusCode_1 = require("../../../src/application/enums/HttpStatusCode");
const container_1 = require("../../../src/container"); // Adjust path
const Policy_1 = require("../../../src/domain/entities/Policy"); // Adjust path
const UserManagementError_1 = require("../../../src/domain/exceptions/UserManagementError"); // Adjust path
const WinstonLogger_1 = require("../../../src/infrastructure/logging/WinstonLogger"); // Adjust path
const types_1 = require("../../../src/shared/constants/types");
const config_mock_1 = require("../../mocks/config.mock"); // Adjust path
// --- Constants ---
const TEST_ADMIN_TOKEN = 'Bearer valid-test-token-for-admin-bypass-12345'; // Ensure matches guard config
const MOCK_AUTH_HEADER = { Authorization: TEST_ADMIN_TOKEN };
const BASE_API_PATH = '/api/admin/policies'; // Base path for policy routes
// --- Mock Payloads & Data (Adjust based on actual DTOs/Entities) ---
const testPolicyId = 'integ-policy-uuid-111';
const testPolicyName = 'policy.integ.test';
const MOCK_VALID_CREATE_POLICY_PAYLOAD = {
    policyName: testPolicyName,
    policyDefinition: 'package integ.test\ndefault allow = false',
    policyLanguage: 'rego',
    description: 'Integration Test Policy',
};
const MOCK_POLICY_ENTITY = new Policy_1.Policy(testPolicyId, testPolicyName, MOCK_VALID_CREATE_POLICY_PAYLOAD.policyDefinition, MOCK_VALID_CREATE_POLICY_PAYLOAD.policyLanguage, 1, // version
MOCK_VALID_CREATE_POLICY_PAYLOAD.description);
const MOCK_VALID_UPDATE_POLICY_PAYLOAD = {
    description: 'Updated Integration Description',
    version: 'v1.1.0',
};
// --- Test Suite ---
describe(`Integration Tests: Policy Admin Routes (${BASE_API_PATH})`, () => {
    let app;
    let logger;
    // --- Setup ---
    beforeAll(() => {
        process.env.NODE_ENV = 'test'; // Ensure test environment for auth bypass
        container_1.container.reset();
        container_1.container.clearInstances();
        // Register mocks/instances needed by the application setup (createApp)
        container_1.container.registerInstance(types_1.TYPES.ConfigService, config_mock_1.mockConfigService);
        container_1.container.registerSingleton(types_1.TYPES.Logger, WinstonLogger_1.WinstonLogger);
        // Service is mocked via jest.mock at the top level
        logger = container_1.container.resolve(types_1.TYPES.Logger);
        app = (0, app_1.createApp)(); // Create app *after* dependencies are set up
    });
    beforeEach(() => {
        jest.clearAllMocks(); // Resets service impl mock calls
    });
    afterAll(() => {
        container_1.container.reset();
        container_1.container.clearInstances();
    });
    // --- Test Cases ---
    describe(`POST ${BASE_API_PATH}`, () => {
        it('should return 201 Created when payload is valid and service succeeds', () => __awaiter(void 0, void 0, void 0, function* () {
            mockPolicyAdminServiceImpl.createPolicy.mockResolvedValueOnce(MOCK_POLICY_ENTITY);
            const response = yield (0, supertest_1.default)(app)
                .post(BASE_API_PATH)
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_VALID_CREATE_POLICY_PAYLOAD)
                .expect(HttpStatusCode_1.HttpStatusCode.CREATED) // 201
                .expect('Content-Type', /json/);
            expect(response.body).toHaveProperty('id', MOCK_POLICY_ENTITY.id);
            expect(response.body).toHaveProperty('policyName', MOCK_POLICY_ENTITY.policyName);
            expect(mockPolicyAdminServiceImpl.createPolicy).toHaveBeenCalledTimes(1);
            expect(mockPolicyAdminServiceImpl.createPolicy).toHaveBeenCalledWith(expect.objectContaining({ id: 'test-admin-id-123' }), // Mock admin user from bypass token
            MOCK_VALID_CREATE_POLICY_PAYLOAD);
        }));
        it('should return 400 Bad Request if validation fails (e.g., missing policyName)', () => __awaiter(void 0, void 0, void 0, function* () {
            const invalidPayload = Object.assign(Object.assign({}, MOCK_VALID_CREATE_POLICY_PAYLOAD), { policyName: undefined });
            yield (0, supertest_1.default)(app)
                .post(BASE_API_PATH)
                .set(MOCK_AUTH_HEADER)
                .send(invalidPayload)
                .expect(HttpStatusCode_1.HttpStatusCode.BAD_REQUEST) // 400
                .expect(res => {
                expect(res.body.name).toBe('ValidationError');
                expect(res.body.details).toHaveProperty('body.policyName');
            });
            expect(mockPolicyAdminServiceImpl.createPolicy).not.toHaveBeenCalled();
        }));
        it('should return 409 Conflict if service throws PolicyExistsError', () => __awaiter(void 0, void 0, void 0, function* () {
            const conflictError = new UserManagementError_1.PolicyExistsError(MOCK_VALID_CREATE_POLICY_PAYLOAD.policyName);
            mockPolicyAdminServiceImpl.createPolicy.mockRejectedValueOnce(conflictError);
            yield (0, supertest_1.default)(app)
                .post(BASE_API_PATH)
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_VALID_CREATE_POLICY_PAYLOAD) // Use VALID payload
                .expect(HttpStatusCode_1.HttpStatusCode.CONFLICT); // 409
            expect(mockPolicyAdminServiceImpl.createPolicy).toHaveBeenCalledTimes(1);
        }));
        it('should return 400 Bad Request if service throws InvalidPolicySyntaxError', () => __awaiter(void 0, void 0, void 0, function* () {
            const syntaxError = new UserManagementError_1.InvalidPolicySyntaxError(MOCK_VALID_CREATE_POLICY_PAYLOAD.policyName, 'rego');
            mockPolicyAdminServiceImpl.createPolicy.mockRejectedValueOnce(syntaxError);
            yield (0, supertest_1.default)(app)
                .post(BASE_API_PATH)
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_VALID_CREATE_POLICY_PAYLOAD)
                .expect(HttpStatusCode_1.HttpStatusCode.BAD_REQUEST); // 400 - Maps to bad request
            expect(mockPolicyAdminServiceImpl.createPolicy).toHaveBeenCalledTimes(1);
        }));
        it('should return 500 Internal Server Error if service throws an unexpected error', () => __awaiter(void 0, void 0, void 0, function* () {
            const genericError = new Error('Create policy internal failure');
            mockPolicyAdminServiceImpl.createPolicy.mockRejectedValueOnce(genericError);
            yield (0, supertest_1.default)(app)
                .post(BASE_API_PATH)
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_VALID_CREATE_POLICY_PAYLOAD)
                .expect(HttpStatusCode_1.HttpStatusCode.INTERNAL_SERVER_ERROR); // 500
            expect(mockPolicyAdminServiceImpl.createPolicy).toHaveBeenCalledTimes(1);
        }));
        it('should return 401 Unauthorized if token is missing', () => __awaiter(void 0, void 0, void 0, function* () {
            yield (0, supertest_1.default)(app)
                .post(BASE_API_PATH)
                .send(MOCK_VALID_CREATE_POLICY_PAYLOAD)
                .expect(HttpStatusCode_1.HttpStatusCode.UNAUTHORIZED); // 401
            expect(mockPolicyAdminServiceImpl.createPolicy).not.toHaveBeenCalled();
        }));
    });
    describe(`GET ${BASE_API_PATH}/:policyId`, () => {
        const targetPolicyId = 'get-policy-integ-uuid';
        const mockPolicyData = new Policy_1.Policy(targetPolicyId, 'get.policy', 'def', 'rego', 1);
        it('should return 200 OK with policy data if policy exists', () => __awaiter(void 0, void 0, void 0, function* () {
            mockPolicyAdminServiceImpl.getPolicy.mockResolvedValueOnce(mockPolicyData);
            yield (0, supertest_1.default)(app)
                .get(`${BASE_API_PATH}/${targetPolicyId}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode_1.HttpStatusCode.OK) // 200
                .expect(res => {
                expect(res.body.id).toBe(targetPolicyId);
                expect(res.body.policyName).toBe('get.policy');
            });
            expect(mockPolicyAdminServiceImpl.getPolicy).toHaveBeenCalledWith(expect.anything(), targetPolicyId);
        }));
        it('should return 404 Not Found if service returns null', () => __awaiter(void 0, void 0, void 0, function* () {
            mockPolicyAdminServiceImpl.getPolicy.mockResolvedValueOnce(null);
            yield (0, supertest_1.default)(app)
                .get(`${BASE_API_PATH}/${targetPolicyId}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode_1.HttpStatusCode.NOT_FOUND); // 404
            expect(mockPolicyAdminServiceImpl.getPolicy).toHaveBeenCalledWith(expect.anything(), targetPolicyId);
        }));
        it('should return 404 Not Found if service throws PolicyNotFoundError', () => __awaiter(void 0, void 0, void 0, function* () {
            const notFoundError = new UserManagementError_1.PolicyNotFoundError(targetPolicyId);
            mockPolicyAdminServiceImpl.getPolicy.mockRejectedValueOnce(notFoundError);
            yield (0, supertest_1.default)(app)
                .get(`${BASE_API_PATH}/${targetPolicyId}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode_1.HttpStatusCode.NOT_FOUND); // 404
            expect(mockPolicyAdminServiceImpl.getPolicy).toHaveBeenCalledWith(expect.anything(), targetPolicyId);
        }));
        it('should return 400 Bad Request if policyId param is not a valid UUID', () => __awaiter(void 0, void 0, void 0, function* () {
            const invalidId = 'not-a-uuid';
            yield (0, supertest_1.default)(app)
                .get(`${BASE_API_PATH}/${invalidId}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode_1.HttpStatusCode.BAD_REQUEST); // 400 (Handled by validation middleware)
            expect(mockPolicyAdminServiceImpl.getPolicy).not.toHaveBeenCalled();
        }));
        it('should return 500 if the service fails unexpectedly', () => __awaiter(void 0, void 0, void 0, function* () {
            const genericError = new Error('Cannot get policy');
            mockPolicyAdminServiceImpl.getPolicy.mockRejectedValueOnce(genericError);
            yield (0, supertest_1.default)(app)
                .get(`${BASE_API_PATH}/${targetPolicyId}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode_1.HttpStatusCode.INTERNAL_SERVER_ERROR); // 500
            expect(mockPolicyAdminServiceImpl.getPolicy).toHaveBeenCalledWith(expect.anything(), targetPolicyId);
        }));
        it('should return 401 Unauthorized if token is missing', () => __awaiter(void 0, void 0, void 0, function* () {
            yield (0, supertest_1.default)(app)
                .get(`${BASE_API_PATH}/${targetPolicyId}`)
                .expect(HttpStatusCode_1.HttpStatusCode.UNAUTHORIZED); // 401
            expect(mockPolicyAdminServiceImpl.getPolicy).not.toHaveBeenCalled();
        }));
    });
    describe(`GET ${BASE_API_PATH}`, () => {
        it('should return 200 OK with a list of policies', () => __awaiter(void 0, void 0, void 0, function* () {
            const mockPolicies = [MOCK_POLICY_ENTITY];
            mockPolicyAdminServiceImpl.listPolicies.mockResolvedValueOnce({ items: mockPolicies, lastEvaluatedKey: undefined });
            yield (0, supertest_1.default)(app)
                .get(BASE_API_PATH)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode_1.HttpStatusCode.OK); // 200
            expect(mockPolicyAdminServiceImpl.listPolicies).toHaveBeenCalledTimes(1);
            expect(mockPolicyAdminServiceImpl.listPolicies).toHaveBeenCalledWith(expect.anything(), { limit: undefined, language: undefined, startKey: undefined });
        }));
        it('should pass pagination and filter parameters to the service', () => __awaiter(void 0, void 0, void 0, function* () {
            mockPolicyAdminServiceImpl.listPolicies.mockResolvedValueOnce({ items: [], nextToken: 'more-policies' }); // Use nextToken if API uses it
            yield (0, supertest_1.default)(app)
                .get(BASE_API_PATH)
                .query({ limit: 15, language: 'rego', startKey: 'opaqueStartKey' })
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode_1.HttpStatusCode.OK); // 200
            expect(mockPolicyAdminServiceImpl.listPolicies).toHaveBeenCalledTimes(1);
            expect(mockPolicyAdminServiceImpl.listPolicies).toHaveBeenCalledWith(expect.anything(), { limit: 15, language: 'rego', startKey: 'opaqueStartKey' });
        }));
        it('should return 500 if the service fails unexpectedly', () => __awaiter(void 0, void 0, void 0, function* () {
            const genericError = new Error('Cannot list policies');
            mockPolicyAdminServiceImpl.listPolicies.mockRejectedValueOnce(genericError);
            yield (0, supertest_1.default)(app)
                .get(BASE_API_PATH)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode_1.HttpStatusCode.INTERNAL_SERVER_ERROR); // 500
            expect(mockPolicyAdminServiceImpl.listPolicies).toHaveBeenCalledTimes(1);
        }));
        it('should return 401 Unauthorized if token is missing', () => __awaiter(void 0, void 0, void 0, function* () {
            yield (0, supertest_1.default)(app)
                .get(BASE_API_PATH)
                .expect(HttpStatusCode_1.HttpStatusCode.UNAUTHORIZED); // 401
            expect(mockPolicyAdminServiceImpl.listPolicies).not.toHaveBeenCalled();
        }));
    });
    describe(`PUT ${BASE_API_PATH}/:policyId`, () => {
        const targetPolicyId = 'update-policy-integ-uuid';
        const updatedPolicy = new Policy_1.Policy(targetPolicyId, 'updated.name', 'updated def', 'rego', 2, MOCK_VALID_UPDATE_POLICY_PAYLOAD.description);
        it('should return 200 OK with updated policy data if service succeeds', () => __awaiter(void 0, void 0, void 0, function* () {
            mockPolicyAdminServiceImpl.updatePolicy.mockResolvedValueOnce(updatedPolicy);
            yield (0, supertest_1.default)(app)
                .put(`${BASE_API_PATH}/${targetPolicyId}`)
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_VALID_UPDATE_POLICY_PAYLOAD)
                .expect(HttpStatusCode_1.HttpStatusCode.OK) // 200
                .expect(res => {
                expect(res.body.id).toBe(targetPolicyId);
                expect(res.body.description).toBe(MOCK_VALID_UPDATE_POLICY_PAYLOAD.description);
                expect(res.body.version).toBe(MOCK_VALID_UPDATE_POLICY_PAYLOAD.version);
            });
            expect(mockPolicyAdminServiceImpl.updatePolicy).toHaveBeenCalledWith(expect.anything(), targetPolicyId, MOCK_VALID_UPDATE_POLICY_PAYLOAD);
        }));
        it('should return 404 Not Found if service throws PolicyNotFoundError', () => __awaiter(void 0, void 0, void 0, function* () {
            const notFoundError = new UserManagementError_1.PolicyNotFoundError(targetPolicyId);
            mockPolicyAdminServiceImpl.updatePolicy.mockRejectedValueOnce(notFoundError);
            yield (0, supertest_1.default)(app)
                .put(`${BASE_API_PATH}/${targetPolicyId}`)
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_VALID_UPDATE_POLICY_PAYLOAD)
                .expect(HttpStatusCode_1.HttpStatusCode.NOT_FOUND); // 404
            expect(mockPolicyAdminServiceImpl.updatePolicy).toHaveBeenCalledTimes(1);
        }));
        it('should return 400 Bad Request if policyId param is invalid', () => __awaiter(void 0, void 0, void 0, function* () {
            yield (0, supertest_1.default)(app)
                .put(`${BASE_API_PATH}/invalid-uuid`)
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_VALID_UPDATE_POLICY_PAYLOAD)
                .expect(HttpStatusCode_1.HttpStatusCode.BAD_REQUEST); // 400
            expect(mockPolicyAdminServiceImpl.updatePolicy).not.toHaveBeenCalled();
        }));
        it('should return 400 Bad Request if payload is invalid (e.g., empty)', () => __awaiter(void 0, void 0, void 0, function* () {
            yield (0, supertest_1.default)(app)
                .put(`${BASE_API_PATH}/${targetPolicyId}`)
                .set(MOCK_AUTH_HEADER)
                .send({}) // Empty payload might fail validation
                .expect(HttpStatusCode_1.HttpStatusCode.BAD_REQUEST); // 400
            expect(mockPolicyAdminServiceImpl.updatePolicy).not.toHaveBeenCalled();
        }));
        it('should return 500 if service fails unexpectedly', () => __awaiter(void 0, void 0, void 0, function* () {
            const genericError = new Error('Update policy internal failure');
            mockPolicyAdminServiceImpl.updatePolicy.mockRejectedValueOnce(genericError);
            yield (0, supertest_1.default)(app)
                .put(`${BASE_API_PATH}/${targetPolicyId}`)
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_VALID_UPDATE_POLICY_PAYLOAD)
                .expect(HttpStatusCode_1.HttpStatusCode.INTERNAL_SERVER_ERROR); // 500
            expect(mockPolicyAdminServiceImpl.updatePolicy).toHaveBeenCalledTimes(1);
        }));
        it('should return 401 Unauthorized if token is missing', () => __awaiter(void 0, void 0, void 0, function* () {
            yield (0, supertest_1.default)(app)
                .put(`${BASE_API_PATH}/${targetPolicyId}`)
                .send(MOCK_VALID_UPDATE_POLICY_PAYLOAD)
                .expect(HttpStatusCode_1.HttpStatusCode.UNAUTHORIZED); // 401
            expect(mockPolicyAdminServiceImpl.updatePolicy).not.toHaveBeenCalled();
        }));
    });
    describe(`DELETE ${BASE_API_PATH}/:policyId`, () => {
        const targetPolicyId = 'delete-policy-integ-uuid';
        it('should return 204 No Content if service succeeds', () => __awaiter(void 0, void 0, void 0, function* () {
            mockPolicyAdminServiceImpl.deletePolicy.mockResolvedValueOnce(undefined); // Returns void
            yield (0, supertest_1.default)(app)
                .delete(`${BASE_API_PATH}/${targetPolicyId}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode_1.HttpStatusCode.NO_CONTENT); // 204
            expect(mockPolicyAdminServiceImpl.deletePolicy).toHaveBeenCalledWith(expect.anything(), targetPolicyId);
        }));
        it('should return 404 Not Found if service throws PolicyNotFoundError', () => __awaiter(void 0, void 0, void 0, function* () {
            const notFoundError = new UserManagementError_1.PolicyNotFoundError(targetPolicyId);
            mockPolicyAdminServiceImpl.deletePolicy.mockRejectedValueOnce(notFoundError);
            yield (0, supertest_1.default)(app)
                .delete(`${BASE_API_PATH}/${targetPolicyId}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode_1.HttpStatusCode.NOT_FOUND); // 404
            expect(mockPolicyAdminServiceImpl.deletePolicy).toHaveBeenCalledWith(expect.anything(), targetPolicyId);
        }));
        it('should return 400 Bad Request if policyId param is invalid', () => __awaiter(void 0, void 0, void 0, function* () {
            yield (0, supertest_1.default)(app)
                .delete(`${BASE_API_PATH}/invalid-uuid`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode_1.HttpStatusCode.BAD_REQUEST); // 400
            expect(mockPolicyAdminServiceImpl.deletePolicy).not.toHaveBeenCalled();
        }));
        it('should return 500 if service fails unexpectedly', () => __awaiter(void 0, void 0, void 0, function* () {
            const genericError = new Error('Delete policy internal failure');
            mockPolicyAdminServiceImpl.deletePolicy.mockRejectedValueOnce(genericError);
            yield (0, supertest_1.default)(app)
                .delete(`${BASE_API_PATH}/${targetPolicyId}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode_1.HttpStatusCode.INTERNAL_SERVER_ERROR); // 500
            expect(mockPolicyAdminServiceImpl.deletePolicy).toHaveBeenCalledWith(expect.anything(), targetPolicyId);
        }));
        it('should return 401 Unauthorized if token is missing', () => __awaiter(void 0, void 0, void 0, function* () {
            yield (0, supertest_1.default)(app)
                .delete(`${BASE_API_PATH}/${targetPolicyId}`)
                .expect(HttpStatusCode_1.HttpStatusCode.UNAUTHORIZED); // 401
            expect(mockPolicyAdminServiceImpl.deletePolicy).not.toHaveBeenCalled();
        }));
    });
}); // End Test Suite
