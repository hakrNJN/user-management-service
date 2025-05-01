// tests/integration/group.admin.routes.spec.ts

// --- Core Imports ---
import { Express } from 'express';
import 'reflect-metadata';
import request from 'supertest';

// --- SDK Mocking Setup ---
import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';

const sdkMock = mockClient(CognitoIdentityProviderClient);
// --- End SDK Mocking Setup ---

// --- JEST CLASS MOCKING for Service ---
const mockGroupAdminServiceImpl = { // Mock implementation object
    createGroup: jest.fn(),
    getGroup: jest.fn(),
    listGroups: jest.fn(),
    deleteGroup: jest.fn(),
};
// *** ADJUST PATH IF NEEDED ***
jest.mock('../../src/application/services/group.admin.service', () => ({
    GroupAdminService: jest.fn().mockImplementation(() => mockGroupAdminServiceImpl)
}));
// --- END JEST CLASS MOCKING ---

// --- Application Imports (AFTER MOCKS) ---
import { createApp } from '../../src/app';
import { HttpStatusCode } from '../../src/application/enums/HttpStatusCode';
import { IConfigService } from '../../src/application/interfaces/IConfigService';
import { ILogger } from '../../src/application/interfaces/ILogger';
// Import IGroupAdminService ONLY for type casting if needed
// import { IGroupAdminService } from '../../src/application/interfaces/IGroupAdminService';
import { container } from '../../src/container';
import { Group } from '../../src/domain/entities/Group'; // Assuming Group entity path
import { GroupExistsError } from '../../src/domain/exceptions/UserManagementError'; // Import relevant domain error
import { WinstonLogger } from '../../src/infrastructure/logging/WinstonLogger';
import { TYPES } from '../../src/shared/constants/types';
import { NotFoundError } from '../../src/shared/errors/BaseError';
import { mockConfigService } from '../mocks/config.mock';
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
    let app: Express;
    let logger: ILogger;

    // --- Setup ---
    beforeAll(() => {
        process.env.NODE_ENV = 'test';
        container.reset();
        container.clearInstances();
        container.registerInstance<IConfigService>(TYPES.ConfigService, mockConfigService);
        container.registerSingleton<ILogger>(TYPES.Logger, WinstonLogger);
        // Service is mocked via jest.mock
        logger = container.resolve<ILogger>(TYPES.Logger);
        app = createApp();
    });

    beforeEach(() => {
        sdkMock.reset();
        sdkMock.onAnyCommand().rejects(new Error('ASSERTION FAILURE: Unexpected AWS SDK command sent!'));
        jest.clearAllMocks(); // Resets service impl mock calls
    });

    afterAll(() => {
        container.reset();
        container.clearInstances();
    });

    // --- Test Cases ---

    describe(`POST ${BASE_API_PATH}`, () => {
        const mockCreatedGroup: Partial<Group> = { // Structure based on Group entity
            groupName: MOCK_VALID_CREATE_GROUP_PAYLOAD.groupName,
            description: MOCK_VALID_CREATE_GROUP_PAYLOAD.description,

            creationDate: new Date(),
            lastModifiedDate: new Date(),
        };

        it('should return 201 Created when payload is valid and service succeeds', async () => {
            mockGroupAdminServiceImpl.createGroup.mockResolvedValueOnce(mockCreatedGroup as Group);

            const response = await request(app)
                .post(BASE_API_PATH)
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_VALID_CREATE_GROUP_PAYLOAD)
                .expect(HttpStatusCode.CREATED) // 201
               .expect('Content-Type', /json/);

               expect(response.body).toHaveProperty('groupName', mockCreatedGroup.groupName);
               expect(response.body.description).toEqual(mockCreatedGroup.description);
            expect(mockGroupAdminServiceImpl.createGroup).toHaveBeenCalledTimes(1);
            // expect(mockGroupAdminServiceImpl.createGroup).toHaveBeenCalledWith(expect.anything(), MOCK_VALID_CREATE_GROUP_PAYLOAD);
            // expect(sdkMock.calls().length).toBe(0);
        });

        it('should return 400 Bad Request if validation fails (e.g., missing groupName)', async () => {
            const invalidPayload = { description: 'Only desc' }; // Missing groupName
            await request(app)
                .post(BASE_API_PATH)
                .set(MOCK_AUTH_HEADER)
                .send(invalidPayload)
                .expect(HttpStatusCode.BAD_REQUEST); // 400

            expect(mockGroupAdminServiceImpl.createGroup).not.toHaveBeenCalled();
        });

        it('should return 409 Conflict if service throws GroupExistsError', async () => {
            const conflictError = new GroupExistsError('Group exists'); // Assuming this exists
            mockGroupAdminServiceImpl.createGroup.mockRejectedValueOnce(conflictError);
            await request(app)
                .post(BASE_API_PATH)
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_VALID_CREATE_GROUP_PAYLOAD) // Use VALID payload
                .expect(HttpStatusCode.CONFLICT); // 409
            expect(mockGroupAdminServiceImpl.createGroup).toHaveBeenCalledTimes(1);
        });

        it('should return 500 Internal Server Error if service throws an unexpected error', async () => {
            const genericError = new Error('DB connection failed');
            mockGroupAdminServiceImpl.createGroup.mockRejectedValueOnce(genericError);
            await request(app)
                .post(BASE_API_PATH)
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_VALID_CREATE_GROUP_PAYLOAD) // Use VALID payload
                .expect(HttpStatusCode.INTERNAL_SERVER_ERROR); // 500
            expect(mockGroupAdminServiceImpl.createGroup).toHaveBeenCalledTimes(1);
        });

        it('should return 401 Unauthorized if token is missing', async () => {
            await request(app)
                .post(BASE_API_PATH)
                .send(MOCK_VALID_CREATE_GROUP_PAYLOAD)
                .expect(HttpStatusCode.UNAUTHORIZED); // 401
            expect(mockGroupAdminServiceImpl.createGroup).not.toHaveBeenCalled();
        });
    });

    describe(`GET ${BASE_API_PATH}`, () => {
        it('should return 200 OK with a list of groups', async () => {
            const mockGroups: Partial<Group>[] = [{ groupName: 'grp1' }, { groupName: 'grp2' }];
            mockGroupAdminServiceImpl.listGroups.mockResolvedValueOnce({ groups: mockGroups as Group[], nextToken: undefined });
            await request(app)
                .get(BASE_API_PATH)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.OK); // 200
            expect(mockGroupAdminServiceImpl.listGroups).toHaveBeenCalledTimes(1);
            expect(mockGroupAdminServiceImpl.listGroups).toHaveBeenCalledWith(expect.anything(), undefined, undefined); // No pagination params sent
            expect(sdkMock.calls().length).toBe(0);
        });

        it('should pass pagination parameters to the service', async () => {
            mockGroupAdminServiceImpl.listGroups.mockResolvedValueOnce({ groups: [], nextToken: 'more-groups' });
            await request(app)
                .get(BASE_API_PATH)
                .query({ limit: 5, nextToken: 'start-token' })
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.OK); // 200
            expect(mockGroupAdminServiceImpl.listGroups).toHaveBeenCalledTimes(1);
            expect(mockGroupAdminServiceImpl.listGroups).toHaveBeenCalledWith(expect.anything(), 5, 'start-token');
        });

        it('should return 500 if the service fails unexpectedly', async () => {
            const genericError = new Error('Cannot list groups');
            mockGroupAdminServiceImpl.listGroups.mockRejectedValueOnce(genericError);
            await request(app)
                .get(BASE_API_PATH)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.INTERNAL_SERVER_ERROR); // 500
            expect(mockGroupAdminServiceImpl.listGroups).toHaveBeenCalledTimes(1);
        });

        it('should return 401 Unauthorized if token is missing', async () => {
            await request(app)
                .get(BASE_API_PATH)
                .expect(HttpStatusCode.UNAUTHORIZED); // 401
            expect(mockGroupAdminServiceImpl.listGroups).not.toHaveBeenCalled();
        });
    });

    describe(`GET ${BASE_API_PATH}/:groupName`, () => {
        const targetgroupName = 'Get-Group-Test';
        const mockGroupData: Partial<Group> = { groupName: targetgroupName, description: 'Details...' };

        it('should return 200 OK with group data if group exists', async () => {
            mockGroupAdminServiceImpl.getGroup.mockResolvedValueOnce(mockGroupData as Group);
            await request(app)
                .get(`${BASE_API_PATH}/${targetgroupName}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.OK); // 200
            expect(mockGroupAdminServiceImpl.getGroup).toHaveBeenCalledWith(expect.anything(), targetgroupName);
            expect(sdkMock.calls().length).toBe(0);
        });

        it('should return 404 Not Found if service returns null', async () => {
            mockGroupAdminServiceImpl.getGroup.mockResolvedValueOnce(null);
            await request(app)
                .get(`${BASE_API_PATH}/${targetgroupName}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.NOT_FOUND); // 404 (Handled by controller)
            expect(mockGroupAdminServiceImpl.getGroup).toHaveBeenCalledWith(expect.anything(), targetgroupName);
        });

        it('should return 404 Not Found if service throws NotFoundError', async () => {
            const notFoundError = new NotFoundError(`Group ${targetgroupName}`);
            mockGroupAdminServiceImpl.getGroup.mockRejectedValueOnce(notFoundError);
            await request(app)
                .get(`${BASE_API_PATH}/${targetgroupName}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.NOT_FOUND); // 404 (Handled by error middleware)
            expect(mockGroupAdminServiceImpl.getGroup).toHaveBeenCalledWith(expect.anything(), targetgroupName);
        });

        it('should return 400 Bad Request if groupName param is invalid', async () => {
            const invalidgroupName = 'Invalid Group Name With Spaces'; // Assuming schema disallows spaces
            await request(app)
                .get(`${BASE_API_PATH}/${encodeURIComponent(invalidgroupName)}`) // URL encode it
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.BAD_REQUEST); // 400 (Handled by validation middleware)
            expect(mockGroupAdminServiceImpl.getGroup).not.toHaveBeenCalled();
        });

        it('should return 500 if the service fails unexpectedly', async () => {
            const genericError = new Error('Cannot get group');
            mockGroupAdminServiceImpl.getGroup.mockRejectedValueOnce(genericError);
            await request(app)
                .get(`${BASE_API_PATH}/${targetgroupName}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.INTERNAL_SERVER_ERROR); // 500
            expect(mockGroupAdminServiceImpl.getGroup).toHaveBeenCalledWith(expect.anything(), targetgroupName);
        });

        it('should return 401 Unauthorized if token is missing', async () => {
            await request(app)
                .get(`${BASE_API_PATH}/${targetgroupName}`)
                .expect(HttpStatusCode.UNAUTHORIZED); // 401
            expect(mockGroupAdminServiceImpl.getGroup).not.toHaveBeenCalled();
        });
    });

    describe(`DELETE ${BASE_API_PATH}/:groupName`, () => {
        const targetgroupName = 'Delete-Group-Test';

        it('should return 204 No Content if service succeeds', async () => {
            mockGroupAdminServiceImpl.deleteGroup.mockResolvedValueOnce(undefined);
            await request(app)
                .delete(`${BASE_API_PATH}/${targetgroupName}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.NO_CONTENT); // 204
            expect(mockGroupAdminServiceImpl.deleteGroup).toHaveBeenCalledWith(expect.anything(), targetgroupName);
            expect(sdkMock.calls().length).toBe(0);
        });

        it('should return 404 Not Found if service throws NotFoundError', async () => {
            const notFoundError = new NotFoundError(`Group ${targetgroupName}`);
            mockGroupAdminServiceImpl.deleteGroup.mockRejectedValueOnce(notFoundError);
            await request(app)
                .delete(`${BASE_API_PATH}/${targetgroupName}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.NOT_FOUND); // 404
            expect(mockGroupAdminServiceImpl.deleteGroup).toHaveBeenCalledWith(expect.anything(), targetgroupName);
        });

        it('should return 400 Bad Request if groupName param is invalid', async () => {
            const invalidgroupName = 'Invalid Chars $$';
            await request(app)
                .delete(`${BASE_API_PATH}/${encodeURIComponent(invalidgroupName)}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.BAD_REQUEST); // 400
            expect(mockGroupAdminServiceImpl.deleteGroup).not.toHaveBeenCalled();
        });

        it('should return 500 if service fails unexpectedly', async () => {
            const genericError = new Error('Cannot delete group');
            mockGroupAdminServiceImpl.deleteGroup.mockRejectedValueOnce(genericError);
            await request(app)
                .delete(`${BASE_API_PATH}/${targetgroupName}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.INTERNAL_SERVER_ERROR); // 500
            expect(mockGroupAdminServiceImpl.deleteGroup).toHaveBeenCalledWith(expect.anything(), targetgroupName);
        });

        it('should return 401 Unauthorized if token is missing', async () => {
            await request(app)
                .delete(`${BASE_API_PATH}/${targetgroupName}`)
                .expect(HttpStatusCode.UNAUTHORIZED); // 401
            expect(mockGroupAdminServiceImpl.deleteGroup).not.toHaveBeenCalled();
        });
    });

}); // End Test Suite