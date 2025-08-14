"use strict";
// tests/integration/user.admin.routes.spec.ts
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
require("reflect-metadata");
const supertest_1 = __importDefault(require("supertest"));
// --- SDK Mocking Setup ---
const client_cognito_identity_provider_1 = require("@aws-sdk/client-cognito-identity-provider");
const aws_sdk_client_mock_1 = require("aws-sdk-client-mock");
require("aws-sdk-client-mock-jest");
const sdkMock = (0, aws_sdk_client_mock_1.mockClient)(client_cognito_identity_provider_1.CognitoIdentityProviderClient);
// --- End SDK Mocking Setup ---
// --- JEST CLASS MOCKING for Service ---
const mockUserAdminService = {
    createUser: jest.fn(),
    listUsers: jest.fn(),
    getUser: jest.fn(),
    updateUserAttributes: jest.fn(),
    deleteUser: jest.fn(),
    disableUser: jest.fn(),
    enableUser: jest.fn(),
    initiatePasswordReset: jest.fn(),
    setUserPassword: jest.fn(),
    addUserToGroup: jest.fn(),
    removeUserFromGroup: jest.fn(),
    listGroupsForUser: jest.fn(),
    listUsersInGroup: jest.fn(),
};
jest.mock('../../../src/application/services/user.admin.service', () => {
    return {
        // Key matches the exported class name
        UserAdminService: jest.fn().mockImplementation(() => {
            // The constructor mock returns the implementation object
            return mockUserAdminService;
        })
    };
});
// --- END JEST CLASS MOCKING ---
// --- Application Imports (AFTER MOCKS) ---
const app_1 = require("../../../src/app");
const HttpStatusCode_1 = require("../../../src/application/enums/HttpStatusCode");
const container_1 = require("../../../src/container");
const UserManagementError_1 = require("../../../src/domain/exceptions/UserManagementError");
const WinstonLogger_1 = require("../../../src/infrastructure/logging/WinstonLogger");
const types_1 = require("../../../src/shared/constants/types");
const BaseError_1 = require("../../../src/shared/errors/BaseError");
const config_mock_1 = require("../../mocks/config.mock");
// Import other schemas if needed for payload definitions
// import { UpdateUserAttributesAdminSchema } from '../../src/api/dtos/update-user-attributes.admin.dto';
// import { AddUserToGroupAdminSchema } from '../../src/api/dtos/add-user-to-group.admin.dto';
// --- Constants ---
const TEST_ADMIN_TOKEN = 'Bearer valid-test-token-for-admin-bypass-12345';
const MOCK_AUTH_HEADER = { Authorization: TEST_ADMIN_TOKEN };
const testUsernameBase = `test-integ-${Date.now()}`; // Base for unique usernames
let createdUsername = null; // Track created user for subsequent tests
const testGroupName = `TestGroup-${Date.now()}`;
// --- Mock Payloads (ADJUST THESE BASED ON YOUR ACTUAL DTOS/SCHEMAS) ---
const MOCK_VALID_CREATE_USER_PAYLOAD = {
    username: `${testUsernameBase}@example.com`,
    temporaryPassword: 'ValidPassword123!',
    userAttributes: {
        "email": `${testUsernameBase}@example.com`,
        "name": "Integration Test User"
    },
};
const MOCK_UPDATE_ATTRIBUTES_PAYLOAD = {
    // This payload must match the BODY of UpdateUserAttributesAdminSchema
    attributesToUpdate: {
        given_name: 'UpdatedIntegFirstName',
        family_name: 'UpdatedIntegLastName',
        'custom:role': 'integ-tester',
    }
};
const MOCK_SET_PASSWORD_PAYLOAD = {
    // Assumes body requires 'password' and optional 'permanent'
    password: 'NewSecureIntegPassword456!',
    permanent: true,
};
const MOCK_ADD_GROUP_PAYLOAD = {
    // Assumes body requires 'groupName'
    groupName: testGroupName,
};
// --- End Mock Payloads ---
// --- Test Suite ---
describe('Integration Tests: User Admin Routes (/api/admin/users)', () => {
    let app;
    let logger;
    // --- Setup ---
    beforeAll(() => {
        process.env.NODE_ENV = 'test';
        container_1.container.reset();
        container_1.container.clearInstances();
        // Register mocks for dependencies EXCEPT the service (handled by jest.mock)
        container_1.container.registerInstance(types_1.TYPES.ConfigService, config_mock_1.mockConfigService);
        container_1.container.registerSingleton(types_1.TYPES.Logger, WinstonLogger_1.WinstonLogger);
        // Service is mocked via jest.mock at top level
        logger = container_1.container.resolve(types_1.TYPES.Logger);
        app = (0, app_1.createApp)();
    });
    beforeEach(() => {
        sdkMock.reset();
        sdkMock.onAnyCommand().rejects(new Error('ASSERTION FAILURE: Unexpected AWS SDK command sent!'));
        jest.clearAllMocks(); // Resets service impl mock calls too
        createdUsername = null; // Reset username tracking before each test block if needed (safer)
    });
    afterAll(() => {
        container_1.container.reset();
        container_1.container.clearInstances();
        // No need to delete user as service is mocked
    });
    // --- Test Cases ---
    describe('Authentication Guard', () => {
        // ... unchanged ...
        it('should return 401 Unauthorized if no token is provided', () => __awaiter(void 0, void 0, void 0, function* () {
            yield (0, supertest_1.default)(app)
                .get('/api/admin/users')
                .expect(HttpStatusCode_1.HttpStatusCode.UNAUTHORIZED); // 401
        }));
        it('should return 401 Unauthorized if an invalid/non-bypass token is provided', () => __awaiter(void 0, void 0, void 0, function* () {
            yield (0, supertest_1.default)(app)
                .get('/api/admin/users')
                .set('Authorization', 'Bearer invalid-token')
                .expect(HttpStatusCode_1.HttpStatusCode.UNAUTHORIZED);
            // In test env, this falls through the bypass and fails standard validation
        }));
        it('should allow access with the correct test bypass token', () => __awaiter(void 0, void 0, void 0, function* () {
            mockUserAdminService.listUsers.mockResolvedValueOnce({ users: [], paginationToken: undefined });
            yield (0, supertest_1.default)(app)
                .get('/api/admin/users')
                .set('Authorization', TEST_ADMIN_TOKEN)
                .expect(HttpStatusCode_1.HttpStatusCode.OK); // 200
        }));
    });
    // --- POST Create User ---
    describe('POST /api/admin/users', () => {
        it('should return 201 Created when payload is valid and service succeeds', () => __awaiter(void 0, void 0, void 0, function* () {
            const payload = Object.assign(Object.assign({}, MOCK_VALID_CREATE_USER_PAYLOAD), { username: `post-create-${Date.now()}@example.com`, userAttributes: Object.assign(Object.assign({}, MOCK_VALID_CREATE_USER_PAYLOAD.userAttributes), { email: `post-create-${Date.now()}@example.com` }) });
            const mockResponse = {
                userId: 'post-create-id',
                username: payload.username,
                status: 'FORCE_CHANGE_PASSWORD'
            };
            mockUserAdminService.createUser.mockResolvedValueOnce(mockResponse);
            const response = yield (0, supertest_1.default)(app)
                .post('/api/admin/users')
                .set(MOCK_AUTH_HEADER)
                .send(payload)
                .expect(HttpStatusCode_1.HttpStatusCode.CREATED)
                .expect('Content-Type', /json/);
            expect(response.body).toHaveProperty('username', payload.username);
            expect(mockUserAdminService.createUser).toHaveBeenCalledTimes(1);
            expect(mockUserAdminService.createUser).toHaveBeenCalledWith(expect.anything(), payload);
            expect(sdkMock.calls().length).toBe(0);
            createdUsername = payload.username; // Store for potential use in this describe block only
        }));
        it('should return 400 Bad Request if validation fails', () => __awaiter(void 0, void 0, void 0, function* () {
            const invalidPayload = { temporaryPassword: 'short', userAttributes: {} };
            yield (0, supertest_1.default)(app)
                .post('/api/admin/users')
                .set(MOCK_AUTH_HEADER)
                .send(invalidPayload)
                .expect(HttpStatusCode_1.HttpStatusCode.BAD_REQUEST); // 400
            expect(mockUserAdminService.createUser).not.toHaveBeenCalled();
        }));
        it('should return 409 Conflict if service throws UserExistsError', () => __awaiter(void 0, void 0, void 0, function* () {
            const conflictError = new BaseError_1.BaseError('UserExistsError', HttpStatusCode_1.HttpStatusCode.CONFLICT, 'User already exists.', true);
            mockUserAdminService.createUser.mockRejectedValueOnce(conflictError);
            yield (0, supertest_1.default)(app)
                .post('/api/admin/users')
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_VALID_CREATE_USER_PAYLOAD) // Use valid payload
                .expect(HttpStatusCode_1.HttpStatusCode.CONFLICT); // 409
            expect(mockUserAdminService.createUser).toHaveBeenCalledTimes(1);
        }));
        it('should return 500 Internal Server Error if service throws an unexpected error', () => __awaiter(void 0, void 0, void 0, function* () {
            const genericError = new Error('Create failed');
            mockUserAdminService.createUser.mockRejectedValueOnce(genericError);
            yield (0, supertest_1.default)(app)
                .post('/api/admin/users')
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_VALID_CREATE_USER_PAYLOAD) // Use valid payload
                .expect(HttpStatusCode_1.HttpStatusCode.INTERNAL_SERVER_ERROR); // 500
            expect(mockUserAdminService.createUser).toHaveBeenCalledTimes(1);
        }));
    });
    // --- GET List Users ---
    describe('GET /api/admin/users', () => {
        it('should return 200 OK with a list of users', () => __awaiter(void 0, void 0, void 0, function* () {
            const mockUsers = [{
                    userId: 'list-id-1',
                    username: 'list1@test.com'
                }];
            mockUserAdminService.listUsers.mockResolvedValueOnce({ users: mockUsers, paginationToken: undefined });
            yield (0, supertest_1.default)(app)
                .get('/api/admin/users')
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode_1.HttpStatusCode.OK); // 200
            expect(mockUserAdminService.listUsers).toHaveBeenCalledTimes(1);
        }));
        it('should pass query parameters to the service', () => __awaiter(void 0, void 0, void 0, function* () {
            mockUserAdminService.listUsers.mockResolvedValueOnce({ users: [], paginationToken: 'next' });
            yield (0, supertest_1.default)(app)
                .get('/api/admin/users')
                .query({ limit: 5, filter: 'status="Enabled"', paginationToken: 'prev' })
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode_1.HttpStatusCode.OK);
            expect(mockUserAdminService.listUsers).toHaveBeenCalledWith(expect.anything(), { limit: 5, filter: 'status="Enabled"', paginationToken: 'prev' });
        }));
        it('should return 500 if the service fails unexpectedly', () => __awaiter(void 0, void 0, void 0, function* () {
            const genericError = new Error('List failed');
            mockUserAdminService.listUsers.mockRejectedValueOnce(genericError);
            yield (0, supertest_1.default)(app)
                .get('/api/admin/users')
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode_1.HttpStatusCode.INTERNAL_SERVER_ERROR); // 500
            expect(mockUserAdminService.listUsers).toHaveBeenCalledTimes(1);
        }));
    });
    // --- GET User By Username ---
    describe('GET /api/admin/users/:username', () => {
        const targetUsername = 'get.user.integ@test.com';
        const userMockData = {
            userId: 'get-integ-id',
            username: targetUsername
        };
        it('should return 200 OK with user data if user exists', () => __awaiter(void 0, void 0, void 0, function* () {
            mockUserAdminService.getUser.mockResolvedValueOnce(userMockData);
            yield (0, supertest_1.default)(app)
                .get(`/api/admin/users/${targetUsername}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode_1.HttpStatusCode.OK); // 200
            expect(mockUserAdminService.getUser).toHaveBeenCalledWith(expect.anything(), targetUsername);
        }));
        it('should return 404 Not Found if service returns null', () => __awaiter(void 0, void 0, void 0, function* () {
            mockUserAdminService.getUser.mockResolvedValueOnce(null);
            yield (0, supertest_1.default)(app)
                .get(`/api/admin/users/${targetUsername}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode_1.HttpStatusCode.NOT_FOUND); // 404
            expect(mockUserAdminService.getUser).toHaveBeenCalledWith(expect.anything(), targetUsername);
        }));
        it('should return 404 Not Found if service throws UserNotFoundError', () => __awaiter(void 0, void 0, void 0, function* () {
            const notFoundError = new UserManagementError_1.UserNotFoundError(`User ${targetUsername}`);
            mockUserAdminService.getUser.mockRejectedValueOnce(notFoundError);
            yield (0, supertest_1.default)(app)
                .get(`/api/admin/users/${targetUsername}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode_1.HttpStatusCode.NOT_FOUND); // 404
            expect(mockUserAdminService.getUser).toHaveBeenCalledWith(expect.anything(), targetUsername);
        }));
        it('should return 500 if the service fails unexpectedly', () => __awaiter(void 0, void 0, void 0, function* () {
            const genericError = new Error('GetUser failed');
            mockUserAdminService.getUser.mockRejectedValueOnce(genericError);
            yield (0, supertest_1.default)(app)
                .get(`/api/admin/users/${targetUsername}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode_1.HttpStatusCode.INTERNAL_SERVER_ERROR); // 500
            expect(mockUserAdminService.getUser).toHaveBeenCalledWith(expect.anything(), targetUsername);
        }));
    });
    // --- PUT Update User Attributes ---
    describe('PUT /api/admin/users/:username/attributes', () => {
        const targetUsername = 'put.user.integ@test.com';
        it('should return 204 No Content if service succeeds', () => __awaiter(void 0, void 0, void 0, function* () {
            mockUserAdminService.updateUserAttributes.mockResolvedValueOnce(undefined); // Returns void
            yield (0, supertest_1.default)(app)
                .put(`/api/admin/users/${targetUsername}/attributes`)
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_UPDATE_ATTRIBUTES_PAYLOAD)
                .expect(HttpStatusCode_1.HttpStatusCode.NO_CONTENT); // 204
            expect(mockUserAdminService.updateUserAttributes).toHaveBeenCalledTimes(1);
            expect(mockUserAdminService.updateUserAttributes).toHaveBeenCalledWith(expect.anything(), Object.assign({ username: targetUsername }, MOCK_UPDATE_ATTRIBUTES_PAYLOAD));
        }));
        it('should return 400 Bad Request if update payload is invalid', () => __awaiter(void 0, void 0, void 0, function* () {
            // Example: sending payload not matching UpdateUserAttributesAdminSchema
            const invalidUpdatePayload = { wrongField: 'some value' };
            yield (0, supertest_1.default)(app)
                .put(`/api/admin/users/${targetUsername}/attributes`)
                .set(MOCK_AUTH_HEADER)
                .send(invalidUpdatePayload)
                .expect(HttpStatusCode_1.HttpStatusCode.BAD_REQUEST); // 400 (Assuming validation middleware catches this)
            expect(mockUserAdminService.updateUserAttributes).not.toHaveBeenCalled();
        }));
        it('should return 404 Not Found if service throws UserNotFoundError', () => __awaiter(void 0, void 0, void 0, function* () {
            const notFoundError = new UserManagementError_1.UserNotFoundError(`User ${targetUsername}`);
            mockUserAdminService.updateUserAttributes.mockRejectedValueOnce(notFoundError);
            yield (0, supertest_1.default)(app)
                .put(`/api/admin/users/${targetUsername}/attributes`)
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_UPDATE_ATTRIBUTES_PAYLOAD)
                .expect(HttpStatusCode_1.HttpStatusCode.NOT_FOUND); // 404
            expect(mockUserAdminService.updateUserAttributes).toHaveBeenCalledTimes(1);
        }));
        it('should return 500 if service fails unexpectedly', () => __awaiter(void 0, void 0, void 0, function* () {
            const genericError = new Error('Update failed');
            mockUserAdminService.updateUserAttributes.mockRejectedValueOnce(genericError);
            yield (0, supertest_1.default)(app)
                .put(`/api/admin/users/${targetUsername}/attributes`)
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_UPDATE_ATTRIBUTES_PAYLOAD)
                .expect(HttpStatusCode_1.HttpStatusCode.INTERNAL_SERVER_ERROR); // 500
            expect(mockUserAdminService.updateUserAttributes).toHaveBeenCalledTimes(1);
        }));
    });
    // --- POST Disable User ---
    describe('POST /api/admin/users/:username/disable', () => {
        const targetUsername = 'disable.user.integ@test.com';
        it('should return 200 OK on successful disable', () => __awaiter(void 0, void 0, void 0, function* () {
            mockUserAdminService.disableUser.mockResolvedValueOnce(undefined);
            yield (0, supertest_1.default)(app)
                .post(`/api/admin/users/${targetUsername}/disable`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode_1.HttpStatusCode.OK); // 200
            expect(mockUserAdminService.disableUser).toHaveBeenCalledWith(expect.anything(), targetUsername);
        }));
        it('should return 404 Not Found if service throws UserNotFoundError', () => __awaiter(void 0, void 0, void 0, function* () {
            const notFoundError = new UserManagementError_1.UserNotFoundError(`User ${targetUsername}`);
            mockUserAdminService.disableUser.mockRejectedValueOnce(notFoundError);
            yield (0, supertest_1.default)(app)
                .post(`/api/admin/users/${targetUsername}/disable`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode_1.HttpStatusCode.NOT_FOUND); // 404
            expect(mockUserAdminService.disableUser).toHaveBeenCalledWith(expect.anything(), targetUsername);
        }));
        it('should return 500 if service fails unexpectedly', () => __awaiter(void 0, void 0, void 0, function* () {
            const genericError = new Error('Disable failed');
            mockUserAdminService.disableUser.mockRejectedValueOnce(genericError);
            yield (0, supertest_1.default)(app)
                .post(`/api/admin/users/${targetUsername}/disable`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode_1.HttpStatusCode.INTERNAL_SERVER_ERROR); // 500
            expect(mockUserAdminService.disableUser).toHaveBeenCalledWith(expect.anything(), targetUsername);
        }));
    });
    // --- POST Enable User ---
    describe('POST /api/admin/users/:username/enable', () => {
        const targetUsername = 'enable.user.integ@test.com';
        it('should return 200 OK on successful enable', () => __awaiter(void 0, void 0, void 0, function* () {
            mockUserAdminService.enableUser.mockResolvedValueOnce(undefined);
            yield (0, supertest_1.default)(app)
                .post(`/api/admin/users/${targetUsername}/enable`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode_1.HttpStatusCode.OK); // 200
            expect(mockUserAdminService.enableUser).toHaveBeenCalledWith(expect.anything(), targetUsername);
        }));
        it('should return 404 Not Found if service throws UserNotFoundError', () => __awaiter(void 0, void 0, void 0, function* () {
            const notFoundError = new UserManagementError_1.UserNotFoundError(`User ${targetUsername}`);
            mockUserAdminService.enableUser.mockRejectedValueOnce(notFoundError);
            yield (0, supertest_1.default)(app)
                .post(`/api/admin/users/${targetUsername}/enable`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode_1.HttpStatusCode.NOT_FOUND); // 404
            expect(mockUserAdminService.enableUser).toHaveBeenCalledWith(expect.anything(), targetUsername);
        }));
        it('should return 500 if service fails unexpectedly', () => __awaiter(void 0, void 0, void 0, function* () {
            const genericError = new Error('Enable failed');
            mockUserAdminService.enableUser.mockRejectedValueOnce(genericError);
            yield (0, supertest_1.default)(app)
                .post(`/api/admin/users/${targetUsername}/enable`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode_1.HttpStatusCode.INTERNAL_SERVER_ERROR); // 500
            expect(mockUserAdminService.enableUser).toHaveBeenCalledWith(expect.anything(), targetUsername);
        }));
    });
    // --- POST Initiate Password Reset ---
    describe('POST /api/admin/users/:username/initiate-password-reset', () => {
        const targetUsername = 'resetpw.user.integ@test.com';
        it('should return 200 OK on successful initiation', () => __awaiter(void 0, void 0, void 0, function* () {
            mockUserAdminService.initiatePasswordReset.mockResolvedValueOnce(undefined);
            yield (0, supertest_1.default)(app)
                .post(`/api/admin/users/${targetUsername}/initiate-password-reset`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode_1.HttpStatusCode.OK); // 200
            expect(mockUserAdminService.initiatePasswordReset).toHaveBeenCalledWith(expect.anything(), targetUsername);
        }));
        it('should return 404 Not Found if service throws UserNotFoundError', () => __awaiter(void 0, void 0, void 0, function* () {
            const notFoundError = new UserManagementError_1.UserNotFoundError(`User ${targetUsername}`);
            mockUserAdminService.initiatePasswordReset.mockRejectedValueOnce(notFoundError);
            yield (0, supertest_1.default)(app)
                .post(`/api/admin/users/${targetUsername}/initiate-password-reset`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode_1.HttpStatusCode.NOT_FOUND); // 404
            expect(mockUserAdminService.initiatePasswordReset).toHaveBeenCalledWith(expect.anything(), targetUsername);
        }));
        it('should return 500 if service fails unexpectedly', () => __awaiter(void 0, void 0, void 0, function* () {
            const genericError = new Error('Reset failed');
            mockUserAdminService.initiatePasswordReset.mockRejectedValueOnce(genericError);
            yield (0, supertest_1.default)(app)
                .post(`/api/admin/users/${targetUsername}/initiate-password-reset`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode_1.HttpStatusCode.INTERNAL_SERVER_ERROR); // 500
            expect(mockUserAdminService.initiatePasswordReset).toHaveBeenCalledWith(expect.anything(), targetUsername);
        }));
    });
    // --- POST Set User Password ---
    describe('POST /api/admin/users/:username/set-password', () => {
        const targetUsername = 'setpw.user.integ@test.com';
        it('should return 200 OK on successful password set', () => __awaiter(void 0, void 0, void 0, function* () {
            mockUserAdminService.setUserPassword.mockResolvedValueOnce(undefined);
            yield (0, supertest_1.default)(app)
                .post(`/api/admin/users/${targetUsername}/set-password`)
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_SET_PASSWORD_PAYLOAD) // Send password in body
                .expect(HttpStatusCode_1.HttpStatusCode.OK); // 200
            expect(mockUserAdminService.setUserPassword).toHaveBeenCalledWith(expect.anything(), targetUsername, MOCK_SET_PASSWORD_PAYLOAD.password, MOCK_SET_PASSWORD_PAYLOAD.permanent);
        }));
        it('should return 400 Bad Request if password missing in body', () => __awaiter(void 0, void 0, void 0, function* () {
            yield (0, supertest_1.default)(app)
                .post(`/api/admin/users/${targetUsername}/set-password`)
                .set(MOCK_AUTH_HEADER)
                .send({ permanent: true }) // Missing password
                .expect(HttpStatusCode_1.HttpStatusCode.BAD_REQUEST); // 400 (Assuming validation middleware catches this)
            expect(mockUserAdminService.setUserPassword).not.toHaveBeenCalled();
        }));
        it('should return 404 Not Found if service throws UserNotFoundError', () => __awaiter(void 0, void 0, void 0, function* () {
            const notFoundError = new UserManagementError_1.UserNotFoundError(`User ${targetUsername}`);
            mockUserAdminService.setUserPassword.mockRejectedValueOnce(notFoundError);
            yield (0, supertest_1.default)(app)
                .post(`/api/admin/users/${targetUsername}/set-password`)
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_SET_PASSWORD_PAYLOAD)
                .expect(HttpStatusCode_1.HttpStatusCode.NOT_FOUND); // 404
            expect(mockUserAdminService.setUserPassword).toHaveBeenCalledTimes(1);
        }));
        it('should return 500 if service fails unexpectedly', () => __awaiter(void 0, void 0, void 0, function* () {
            const genericError = new Error('Set PW failed');
            mockUserAdminService.setUserPassword.mockRejectedValueOnce(genericError);
            yield (0, supertest_1.default)(app)
                .post(`/api/admin/users/${targetUsername}/set-password`)
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_SET_PASSWORD_PAYLOAD)
                .expect(HttpStatusCode_1.HttpStatusCode.INTERNAL_SERVER_ERROR); // 500
            expect(mockUserAdminService.setUserPassword).toHaveBeenCalledTimes(1);
        }));
    });
    // --- Group Management Tests ---
    describe('User Group Management', () => {
        const targetUsername = 'group.user.integ@test.com';
        describe('POST /api/admin/users/:username/groups', () => {
            it('should return 200 OK when adding user to group succeeds', () => __awaiter(void 0, void 0, void 0, function* () {
                mockUserAdminService.addUserToGroup.mockResolvedValueOnce(undefined);
                yield (0, supertest_1.default)(app)
                    .post(`/api/admin/users/${targetUsername}/groups`)
                    .set(MOCK_AUTH_HEADER)
                    .send(MOCK_ADD_GROUP_PAYLOAD) // groupName in body
                    .expect(HttpStatusCode_1.HttpStatusCode.OK); // 200
                expect(mockUserAdminService.addUserToGroup).toHaveBeenCalledWith(expect.anything(), targetUsername, MOCK_ADD_GROUP_PAYLOAD.groupName);
            }));
            it('should return 400 Bad Request if groupName missing', () => __awaiter(void 0, void 0, void 0, function* () {
                yield (0, supertest_1.default)(app)
                    .post(`/api/admin/users/${targetUsername}/groups`)
                    .set(MOCK_AUTH_HEADER)
                    .send({}) // Missing groupName
                    .expect(HttpStatusCode_1.HttpStatusCode.BAD_REQUEST); // 400
                expect(mockUserAdminService.addUserToGroup).not.toHaveBeenCalled();
            }));
            it('should return 404 Not Found if user/group not found (via service error)', () => __awaiter(void 0, void 0, void 0, function* () {
                const notFoundError = new BaseError_1.NotFoundError(`User or Group`); // Generic NotFound from service
                mockUserAdminService.addUserToGroup.mockRejectedValueOnce(notFoundError);
                yield (0, supertest_1.default)(app)
                    .post(`/api/admin/users/${targetUsername}/groups`)
                    .set(MOCK_AUTH_HEADER)
                    .send(MOCK_ADD_GROUP_PAYLOAD)
                    .expect(HttpStatusCode_1.HttpStatusCode.NOT_FOUND); // 404
                expect(mockUserAdminService.addUserToGroup).toHaveBeenCalledTimes(1);
            }));
            // Add test for UserAlreadyInGroupError if service throws it
            // Add test for generic 500 error
        });
        describe('GET /api/admin/users/:username/groups', () => {
            it('should return 200 OK and list groups for user', () => __awaiter(void 0, void 0, void 0, function* () {
                const mockGroups = [{ GroupName: testGroupName, Description: 'Test Desc' }];
                mockUserAdminService.listGroupsForUser.mockResolvedValueOnce({ groups: mockGroups, nextToken: undefined });
                yield (0, supertest_1.default)(app)
                    .get(`/api/admin/users/${targetUsername}/groups`)
                    .set(MOCK_AUTH_HEADER)
                    .expect(HttpStatusCode_1.HttpStatusCode.OK); // 200
                expect(mockUserAdminService.listGroupsForUser).toHaveBeenCalledWith(expect.anything(), targetUsername, undefined, undefined);
            }));
            it('should return 404 if user not found (via service error)', () => __awaiter(void 0, void 0, void 0, function* () {
                const notFoundError = new UserManagementError_1.UserNotFoundError(`User ${targetUsername}`);
                mockUserAdminService.listGroupsForUser.mockRejectedValueOnce(notFoundError);
                yield (0, supertest_1.default)(app)
                    .get(`/api/admin/users/${targetUsername}/groups`)
                    .set(MOCK_AUTH_HEADER)
                    .expect(HttpStatusCode_1.HttpStatusCode.NOT_FOUND); // 404
                expect(mockUserAdminService.listGroupsForUser).toHaveBeenCalledTimes(1);
            }));
            // Add test for generic 500 error
        });
        describe('DELETE /api/admin/users/:username/groups/:groupName', () => {
            it('should return 204 No Content when removing user from group', () => __awaiter(void 0, void 0, void 0, function* () {
                mockUserAdminService.removeUserFromGroup.mockResolvedValueOnce(undefined);
                yield (0, supertest_1.default)(app)
                    .delete(`/api/admin/users/${targetUsername}/groups/${testGroupName}`)
                    .set(MOCK_AUTH_HEADER)
                    .expect(HttpStatusCode_1.HttpStatusCode.NO_CONTENT); // 204
                expect(mockUserAdminService.removeUserFromGroup).toHaveBeenCalledWith(expect.anything(), targetUsername, testGroupName);
            }));
            it('should return 404 if user/group not found (via service error)', () => __awaiter(void 0, void 0, void 0, function* () {
                const notFoundError = new BaseError_1.NotFoundError(`User or Group`);
                mockUserAdminService.removeUserFromGroup.mockRejectedValueOnce(notFoundError);
                yield (0, supertest_1.default)(app)
                    .delete(`/api/admin/users/${targetUsername}/groups/${testGroupName}`)
                    .set(MOCK_AUTH_HEADER)
                    .expect(HttpStatusCode_1.HttpStatusCode.NOT_FOUND); // 404
                expect(mockUserAdminService.removeUserFromGroup).toHaveBeenCalledTimes(1);
            }));
            // Add test for generic 500 error
        });
    });
    // --- DELETE User ---
    // Note: This should ideally be the last test for a given user if relying on state
    describe('DELETE /api/admin/users/:username', () => {
        const targetUsername = 'delete.user.integ@test.com';
        // Consider creating a user specifically for deletion in a 'beforeAll' for this block
        // to avoid conflicts with other tests if they run in parallel or are reordered.
        // For now, we assume a user exists (or mock service appropriately)
        it('should return 204 No Content if service succeeds', () => __awaiter(void 0, void 0, void 0, function* () {
            mockUserAdminService.deleteUser.mockResolvedValueOnce(undefined);
            yield (0, supertest_1.default)(app)
                .delete(`/api/admin/users/${targetUsername}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode_1.HttpStatusCode.NO_CONTENT); // 204
            expect(mockUserAdminService.deleteUser).toHaveBeenCalledWith(expect.anything(), targetUsername);
        }));
        it('should return 404 Not Found if service throws UserNotFoundError', () => __awaiter(void 0, void 0, void 0, function* () {
            const notFoundError = new UserManagementError_1.UserNotFoundError(`User ${targetUsername}`);
            mockUserAdminService.deleteUser.mockRejectedValueOnce(notFoundError);
            yield (0, supertest_1.default)(app)
                .delete(`/api/admin/users/${targetUsername}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode_1.HttpStatusCode.NOT_FOUND); // 404
            expect(mockUserAdminService.deleteUser).toHaveBeenCalledWith(expect.anything(), targetUsername);
        }));
        it('should return 500 if service fails unexpectedly', () => __awaiter(void 0, void 0, void 0, function* () {
            const genericError = new Error('Delete failed');
            mockUserAdminService.deleteUser.mockRejectedValueOnce(genericError);
            yield (0, supertest_1.default)(app)
                .delete(`/api/admin/users/${targetUsername}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode_1.HttpStatusCode.INTERNAL_SERVER_ERROR); // 500
            expect(mockUserAdminService.deleteUser).toHaveBeenCalledWith(expect.anything(), targetUsername);
        }));
    });
}); // End Test Suite
