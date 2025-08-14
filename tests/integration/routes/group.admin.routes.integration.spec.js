"use strict";
// tests/integration/group.admin.routes.spec.ts
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
const mockGroupAdminServiceImpl = {
    createGroup: jest.fn(),
    getGroup: jest.fn(),
    listGroups: jest.fn(),
    deleteGroup: jest.fn(),
};
// *** ADJUST PATH IF NEEDED ***
jest.mock('../../../src/application/services/group.admin.service', () => ({
    GroupAdminService: jest.fn().mockImplementation(() => mockGroupAdminServiceImpl)
}));
// --- END JEST CLASS MOCKING ---
// --- Application Imports (AFTER MOCKS) ---
const app_1 = require("../../../src/app");
const HttpStatusCode_1 = require("../../../src/application/enums/HttpStatusCode");
// Import IGroupAdminService ONLY for type casting if needed
// import { IGroupAdminService } from '../../src/application/interfaces/IGroupAdminService';
const container_1 = require("../../../src/container");
const UserManagementError_1 = require("../../../src/domain/exceptions/UserManagementError"); // Import relevant domain error
const WinstonLogger_1 = require("../../../src/infrastructure/logging/WinstonLogger");
const types_1 = require("../../../src/shared/constants/types");
const BaseError_1 = require("../../../src/shared/errors/BaseError");
const config_mock_1 = require("../../mocks/config.mock");
// Import DTOs/Schemas if needed for payload definitions
// import { CreateGroupAdminSchema, groupNameParamsSchema } from '../../src/api/dtos/create-group.admin.dto';
// --- Constants ---
const TEST_ADMIN_TOKEN = 'Bearer valid-test-token-for-admin-bypass-12345';
const MOCK_AUTH_HEADER = { Authorization: TEST_ADMIN_TOKEN };
const BASE_API_PATH = '/api/admin/groups'; // Base path for group routes
// --- Mock Payloads (ADJUST BASED ON YOUR ACTUAL DTOS/SCHEMAS) ---
const MOCK_VALID_CREATE_GROUP_PAYLOAD = {
    groupName: `Test-Group-${Date.now()}`,
    description: 'Integration Test Group Description',
    precedence: 10, // Optional example
};
// --- Test Suite ---
describe(`Integration Tests: Group Admin Routes (${BASE_API_PATH})`, () => {
    let app;
    let logger;
    // --- Setup ---
    beforeAll(() => {
        process.env.NODE_ENV = 'test';
        container_1.container.reset();
        container_1.container.clearInstances();
        container_1.container.registerInstance(types_1.TYPES.ConfigService, config_mock_1.mockConfigService);
        container_1.container.registerSingleton(types_1.TYPES.Logger, WinstonLogger_1.WinstonLogger);
        // Service is mocked via jest.mock
        logger = container_1.container.resolve(types_1.TYPES.Logger);
        app = (0, app_1.createApp)();
    });
    beforeEach(() => {
        sdkMock.reset();
        sdkMock.onAnyCommand().rejects(new Error('ASSERTION FAILURE: Unexpected AWS SDK command sent!'));
        jest.clearAllMocks(); // Resets service impl mock calls
    });
    afterAll(() => {
        container_1.container.reset();
        container_1.container.clearInstances();
    });
    // --- Test Cases ---
    describe(`POST ${BASE_API_PATH}`, () => {
        const mockCreatedGroup = {
            groupName: MOCK_VALID_CREATE_GROUP_PAYLOAD.groupName,
            description: MOCK_VALID_CREATE_GROUP_PAYLOAD.description,
            creationDate: new Date(),
            lastModifiedDate: new Date(),
        };
        it('should return 201 Created when payload is valid and service succeeds', () => __awaiter(void 0, void 0, void 0, function* () {
            mockGroupAdminServiceImpl.createGroup.mockResolvedValueOnce(mockCreatedGroup);
            const response = yield (0, supertest_1.default)(app)
                .post(BASE_API_PATH)
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_VALID_CREATE_GROUP_PAYLOAD)
                .expect(HttpStatusCode_1.HttpStatusCode.CREATED) // 201
                .expect('Content-Type', /json/);
            expect(response.body).toHaveProperty('groupName', mockCreatedGroup.groupName);
            expect(response.body.description).toEqual(mockCreatedGroup.description);
            expect(mockGroupAdminServiceImpl.createGroup).toHaveBeenCalledTimes(1);
            // expect(mockGroupAdminServiceImpl.createGroup).toHaveBeenCalledWith(expect.anything(), MOCK_VALID_CREATE_GROUP_PAYLOAD);
            // expect(sdkMock.calls().length).toBe(0);
        }));
        it('should return 400 Bad Request if validation fails (e.g., missing groupName)', () => __awaiter(void 0, void 0, void 0, function* () {
            const invalidPayload = { description: 'Only desc' }; // Missing groupName
            yield (0, supertest_1.default)(app)
                .post(BASE_API_PATH)
                .set(MOCK_AUTH_HEADER)
                .send(invalidPayload)
                .expect(HttpStatusCode_1.HttpStatusCode.BAD_REQUEST); // 400
            expect(mockGroupAdminServiceImpl.createGroup).not.toHaveBeenCalled();
        }));
        it('should return 409 Conflict if service throws GroupExistsError', () => __awaiter(void 0, void 0, void 0, function* () {
            const conflictError = new UserManagementError_1.GroupExistsError('Group exists'); // Assuming this exists
            mockGroupAdminServiceImpl.createGroup.mockRejectedValueOnce(conflictError);
            yield (0, supertest_1.default)(app)
                .post(BASE_API_PATH)
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_VALID_CREATE_GROUP_PAYLOAD) // Use VALID payload
                .expect(HttpStatusCode_1.HttpStatusCode.CONFLICT); // 409
            expect(mockGroupAdminServiceImpl.createGroup).toHaveBeenCalledTimes(1);
        }));
        it('should return 500 Internal Server Error if service throws an unexpected error', () => __awaiter(void 0, void 0, void 0, function* () {
            const genericError = new Error('DB connection failed');
            mockGroupAdminServiceImpl.createGroup.mockRejectedValueOnce(genericError);
            yield (0, supertest_1.default)(app)
                .post(BASE_API_PATH)
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_VALID_CREATE_GROUP_PAYLOAD) // Use VALID payload
                .expect(HttpStatusCode_1.HttpStatusCode.INTERNAL_SERVER_ERROR); // 500
            expect(mockGroupAdminServiceImpl.createGroup).toHaveBeenCalledTimes(1);
        }));
        it('should return 401 Unauthorized if token is missing', () => __awaiter(void 0, void 0, void 0, function* () {
            yield (0, supertest_1.default)(app)
                .post(BASE_API_PATH)
                .send(MOCK_VALID_CREATE_GROUP_PAYLOAD)
                .expect(HttpStatusCode_1.HttpStatusCode.UNAUTHORIZED); // 401
            expect(mockGroupAdminServiceImpl.createGroup).not.toHaveBeenCalled();
        }));
    });
    describe(`GET ${BASE_API_PATH}`, () => {
        it('should return 200 OK with a list of groups', () => __awaiter(void 0, void 0, void 0, function* () {
            const mockGroups = [{ groupName: 'grp1' }, { groupName: 'grp2' }];
            mockGroupAdminServiceImpl.listGroups.mockResolvedValueOnce({ groups: mockGroups, nextToken: undefined });
            yield (0, supertest_1.default)(app)
                .get(BASE_API_PATH)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode_1.HttpStatusCode.OK); // 200
            expect(mockGroupAdminServiceImpl.listGroups).toHaveBeenCalledTimes(1);
            expect(mockGroupAdminServiceImpl.listGroups).toHaveBeenCalledWith(expect.anything(), undefined, undefined); // No pagination params sent
            expect(sdkMock.calls().length).toBe(0);
        }));
        it('should pass pagination parameters to the service', () => __awaiter(void 0, void 0, void 0, function* () {
            mockGroupAdminServiceImpl.listGroups.mockResolvedValueOnce({ groups: [], nextToken: 'more-groups' });
            yield (0, supertest_1.default)(app)
                .get(BASE_API_PATH)
                .query({ limit: 5, nextToken: 'start-token' })
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode_1.HttpStatusCode.OK); // 200
            expect(mockGroupAdminServiceImpl.listGroups).toHaveBeenCalledTimes(1);
            expect(mockGroupAdminServiceImpl.listGroups).toHaveBeenCalledWith(expect.anything(), 5, 'start-token');
        }));
        it('should return 500 if the service fails unexpectedly', () => __awaiter(void 0, void 0, void 0, function* () {
            const genericError = new Error('Cannot list groups');
            mockGroupAdminServiceImpl.listGroups.mockRejectedValueOnce(genericError);
            yield (0, supertest_1.default)(app)
                .get(BASE_API_PATH)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode_1.HttpStatusCode.INTERNAL_SERVER_ERROR); // 500
            expect(mockGroupAdminServiceImpl.listGroups).toHaveBeenCalledTimes(1);
        }));
        it('should return 401 Unauthorized if token is missing', () => __awaiter(void 0, void 0, void 0, function* () {
            yield (0, supertest_1.default)(app)
                .get(BASE_API_PATH)
                .expect(HttpStatusCode_1.HttpStatusCode.UNAUTHORIZED); // 401
            expect(mockGroupAdminServiceImpl.listGroups).not.toHaveBeenCalled();
        }));
    });
    describe(`GET ${BASE_API_PATH}/:groupName`, () => {
        const targetgroupName = 'Get-Group-Test';
        const mockGroupData = { groupName: targetgroupName, description: 'Details...' };
        it('should return 200 OK with group data if group exists', () => __awaiter(void 0, void 0, void 0, function* () {
            mockGroupAdminServiceImpl.getGroup.mockResolvedValueOnce(mockGroupData);
            yield (0, supertest_1.default)(app)
                .get(`${BASE_API_PATH}/${targetgroupName}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode_1.HttpStatusCode.OK); // 200
            expect(mockGroupAdminServiceImpl.getGroup).toHaveBeenCalledWith(expect.anything(), targetgroupName);
            expect(sdkMock.calls().length).toBe(0);
        }));
        it('should return 404 Not Found if service returns null', () => __awaiter(void 0, void 0, void 0, function* () {
            mockGroupAdminServiceImpl.getGroup.mockResolvedValueOnce(null);
            yield (0, supertest_1.default)(app)
                .get(`${BASE_API_PATH}/${targetgroupName}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode_1.HttpStatusCode.NOT_FOUND); // 404 (Handled by controller)
            expect(mockGroupAdminServiceImpl.getGroup).toHaveBeenCalledWith(expect.anything(), targetgroupName);
        }));
        it('should return 404 Not Found if service throws NotFoundError', () => __awaiter(void 0, void 0, void 0, function* () {
            const notFoundError = new BaseError_1.NotFoundError(`Group ${targetgroupName}`);
            mockGroupAdminServiceImpl.getGroup.mockRejectedValueOnce(notFoundError);
            yield (0, supertest_1.default)(app)
                .get(`${BASE_API_PATH}/${targetgroupName}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode_1.HttpStatusCode.NOT_FOUND); // 404 (Handled by error middleware)
            expect(mockGroupAdminServiceImpl.getGroup).toHaveBeenCalledWith(expect.anything(), targetgroupName);
        }));
        it('should return 400 Bad Request if groupName param is invalid', () => __awaiter(void 0, void 0, void 0, function* () {
            const invalidgroupName = 'Invalid Group Name With Spaces'; // Assuming schema disallows spaces
            yield (0, supertest_1.default)(app)
                .get(`${BASE_API_PATH}/${encodeURIComponent(invalidgroupName)}`) // URL encode it
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode_1.HttpStatusCode.BAD_REQUEST); // 400 (Handled by validation middleware)
            expect(mockGroupAdminServiceImpl.getGroup).not.toHaveBeenCalled();
        }));
        it('should return 500 if the service fails unexpectedly', () => __awaiter(void 0, void 0, void 0, function* () {
            const genericError = new Error('Cannot get group');
            mockGroupAdminServiceImpl.getGroup.mockRejectedValueOnce(genericError);
            yield (0, supertest_1.default)(app)
                .get(`${BASE_API_PATH}/${targetgroupName}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode_1.HttpStatusCode.INTERNAL_SERVER_ERROR); // 500
            expect(mockGroupAdminServiceImpl.getGroup).toHaveBeenCalledWith(expect.anything(), targetgroupName);
        }));
        it('should return 401 Unauthorized if token is missing', () => __awaiter(void 0, void 0, void 0, function* () {
            yield (0, supertest_1.default)(app)
                .get(`${BASE_API_PATH}/${targetgroupName}`)
                .expect(HttpStatusCode_1.HttpStatusCode.UNAUTHORIZED); // 401
            expect(mockGroupAdminServiceImpl.getGroup).not.toHaveBeenCalled();
        }));
    });
    describe(`DELETE ${BASE_API_PATH}/:groupName`, () => {
        const targetgroupName = 'Delete-Group-Test';
        it('should return 204 No Content if service succeeds', () => __awaiter(void 0, void 0, void 0, function* () {
            mockGroupAdminServiceImpl.deleteGroup.mockResolvedValueOnce(undefined);
            yield (0, supertest_1.default)(app)
                .delete(`${BASE_API_PATH}/${targetgroupName}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode_1.HttpStatusCode.NO_CONTENT); // 204
            expect(mockGroupAdminServiceImpl.deleteGroup).toHaveBeenCalledWith(expect.anything(), targetgroupName);
            expect(sdkMock.calls().length).toBe(0);
        }));
        it('should return 404 Not Found if service throws NotFoundError', () => __awaiter(void 0, void 0, void 0, function* () {
            const notFoundError = new BaseError_1.NotFoundError(`Group ${targetgroupName}`);
            mockGroupAdminServiceImpl.deleteGroup.mockRejectedValueOnce(notFoundError);
            yield (0, supertest_1.default)(app)
                .delete(`${BASE_API_PATH}/${targetgroupName}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode_1.HttpStatusCode.NOT_FOUND); // 404
            expect(mockGroupAdminServiceImpl.deleteGroup).toHaveBeenCalledWith(expect.anything(), targetgroupName);
        }));
        it('should return 400 Bad Request if groupName param is invalid', () => __awaiter(void 0, void 0, void 0, function* () {
            const invalidgroupName = 'Invalid Chars $$';
            yield (0, supertest_1.default)(app)
                .delete(`${BASE_API_PATH}/${encodeURIComponent(invalidgroupName)}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode_1.HttpStatusCode.BAD_REQUEST); // 400
            expect(mockGroupAdminServiceImpl.deleteGroup).not.toHaveBeenCalled();
        }));
        it('should return 500 if service fails unexpectedly', () => __awaiter(void 0, void 0, void 0, function* () {
            const genericError = new Error('Cannot delete group');
            mockGroupAdminServiceImpl.deleteGroup.mockRejectedValueOnce(genericError);
            yield (0, supertest_1.default)(app)
                .delete(`${BASE_API_PATH}/${targetgroupName}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode_1.HttpStatusCode.INTERNAL_SERVER_ERROR); // 500
            expect(mockGroupAdminServiceImpl.deleteGroup).toHaveBeenCalledWith(expect.anything(), targetgroupName);
        }));
        it('should return 401 Unauthorized if token is missing', () => __awaiter(void 0, void 0, void 0, function* () {
            yield (0, supertest_1.default)(app)
                .delete(`${BASE_API_PATH}/${targetgroupName}`)
                .expect(HttpStatusCode_1.HttpStatusCode.UNAUTHORIZED); // 401
            expect(mockGroupAdminServiceImpl.deleteGroup).not.toHaveBeenCalled();
        }));
    });
}); // End Test Suite
