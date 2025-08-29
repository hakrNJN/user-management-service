// tests/integration/user.admin.routes.spec.ts

jest.mock('../../../src/infrastructure/logging/WinstonLogger', () => {
    return {
        WinstonLogger: jest.fn().mockImplementation(() => {
            return {
                info: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
                debug: jest.fn(),
            };
        }),
    };
});

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
const mockUserAdminService = { // Mock implementation object
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

jest.mock('../../../src/application/services/user.admin.service', () => { // <<< Path to the service file
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
import { createApp } from '../../../src/app';
import { HttpStatusCode } from '../../../src/application/enums/HttpStatusCode';
import { IConfigService } from '../../../src/application/interfaces/IConfigService';
import { ILogger } from '../../../src/application/interfaces/ILogger';
import { container } from '../../../src/container';
import { AdminUserView } from '../../../src/domain/entities/AdminUserView';
import { UserNotFoundError } from '../../../src/domain/exceptions/UserManagementError';
import { WinstonLogger } from '../../../src/infrastructure/logging/WinstonLogger';
import { TYPES } from '../../../src/shared/constants/types';
import { BaseError, NotFoundError } from '../../../src/shared/errors/BaseError';
import { mockConfigService } from '../../mocks/config.mock';
// Import other schemas if needed for payload definitions
// import { UpdateUserAttributesAdminSchema } from '../../src/api/dtos/update-user-attributes.admin.dto';
// import { AddUserToGroupAdminSchema } from '../../src/api/dtos/add-user-to-group.admin.dto';

// --- Constants ---
const TEST_ADMIN_TOKEN = 'Bearer valid-test-token-for-admin-bypass-12345';
const MOCK_AUTH_HEADER = { Authorization: TEST_ADMIN_TOKEN };
const testUsernameBase = `test-integ-${Date.now()}`; // Base for unique usernames
let createdUsername: string | null = null; // Track created user for subsequent tests
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
    let app: Express;
    let logger: ILogger;

    // --- Setup ---
    beforeAll(() => {
        process.env.NODE_ENV = 'test';
        container.reset();
        container.clearInstances();

        // Register mocks for dependencies EXCEPT the service (handled by jest.mock)
        container.registerInstance<IConfigService>(TYPES.ConfigService, mockConfigService);
        // Service is mocked via jest.mock at top level
        logger = container.resolve<ILogger>(TYPES.Logger);
        app = createApp();
    });

    beforeEach(() => {
        sdkMock.reset();
        sdkMock.onAnyCommand().rejects(new Error('ASSERTION FAILURE: Unexpected AWS SDK command sent!'));
        jest.clearAllMocks(); // Resets service impl mock calls too
        createdUsername = null; // Reset username tracking before each test block if needed (safer)
    });

    afterAll(() => {
        container.reset();
        container.clearInstances();
        // No need to delete user as service is mocked
    });

    // --- Test Cases ---

    describe('Authentication Guard', () => {
        // ... unchanged ...
        it('should return 401 Unauthorized if no token is provided', async () => {
            await request(app)
                .get('/api/admin/users')
                .expect(HttpStatusCode.UNAUTHORIZED); // 401
        });
        it('should return 401 Unauthorized if an invalid/non-bypass token is provided', async () => {
            await request(app)
                .get('/api/admin/users')
                .set('Authorization', 'Bearer invalid-token')
                .expect(HttpStatusCode.UNAUTHORIZED);
            // In test env, this falls through the bypass and fails standard validation
        });
        it('should allow access with the correct test bypass token', async () => {
            mockUserAdminService.listUsers.mockResolvedValueOnce({ users: [], paginationToken: undefined });
            await request(app)
                .get('/api/admin/users')
                .set('Authorization', TEST_ADMIN_TOKEN)
                .expect(HttpStatusCode.OK); // 200
        });
    });
    // --- POST Create User ---
    describe('POST /api/admin/users', () => {
        it('should return 201 Created when payload is valid and service succeeds', async () => {
            const payload = {
                ...MOCK_VALID_CREATE_USER_PAYLOAD,
                username: `post-create-${Date.now()}@example.com`,
                userAttributes: {
                    ...MOCK_VALID_CREATE_USER_PAYLOAD.userAttributes,
                    email: `post-create-${Date.now()}@example.com`
                }
            };
            const mockResponse: Partial<AdminUserView> = {
                userId: 'post-create-id',
                username: payload.username,
                status: 'FORCE_CHANGE_PASSWORD'
            };
            mockUserAdminService.createUser.mockResolvedValueOnce(mockResponse as AdminUserView);

            const response = await request(app)
                .post('/api/admin/users')
                .set(MOCK_AUTH_HEADER)
                .send(payload)
                .expect(HttpStatusCode.CREATED)
                .expect('Content-Type', /json/);

            expect(response.body).toHaveProperty('username', payload.username);
            expect(mockUserAdminService.createUser).toHaveBeenCalledTimes(1);
            expect(mockUserAdminService.createUser).toHaveBeenCalledWith(expect.anything(), payload);
            expect(sdkMock.calls().length).toBe(0);
            createdUsername = payload.username; // Store for potential use in this describe block only
        });

        it('should return 400 Bad Request if validation fails', async () => {
            const invalidPayload = { temporaryPassword: 'short', userAttributes: {} };
            await request(app)
                .post('/api/admin/users')
                .set(MOCK_AUTH_HEADER)
                .send(invalidPayload)
                .expect(HttpStatusCode.BAD_REQUEST); // 400
            expect(mockUserAdminService.createUser).not.toHaveBeenCalled();
        });

        it('should return 409 Conflict if service throws UserExistsError', async () => {
            const conflictError = new BaseError('UserExistsError', HttpStatusCode.CONFLICT, 'User already exists.', true);
            mockUserAdminService.createUser.mockRejectedValueOnce(conflictError);
            await request(app)
                .post('/api/admin/users')
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_VALID_CREATE_USER_PAYLOAD) // Use valid payload
                .expect(HttpStatusCode.CONFLICT); // 409
            expect(mockUserAdminService.createUser).toHaveBeenCalledTimes(1);
        });

        it('should return 500 Internal Server Error if service throws an unexpected error', async () => {
            const genericError = new Error('Create failed');
            mockUserAdminService.createUser.mockRejectedValueOnce(genericError);
            await request(app)
                .post('/api/admin/users')
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_VALID_CREATE_USER_PAYLOAD) // Use valid payload
                .expect(HttpStatusCode.INTERNAL_SERVER_ERROR); // 500
            expect(mockUserAdminService.createUser).toHaveBeenCalledTimes(1);
        });
    });

    // --- GET List Users ---
    describe('GET /api/admin/users', () => {
        it('should return 200 OK with a list of users', async () => {
            const mockUsers = [{
                userId: 'list-id-1',
                username: 'list1@test.com'
            }];
            mockUserAdminService.listUsers.mockResolvedValueOnce({ users: mockUsers as AdminUserView[], paginationToken: undefined });
            await request(app)
                .get('/api/admin/users')
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.OK); // 200
            expect(mockUserAdminService.listUsers).toHaveBeenCalledTimes(1);
        });

        it('should pass query parameters to the service', async () => {
            mockUserAdminService.listUsers.mockResolvedValueOnce({ users: [], paginationToken: 'next' });
            await request(app)
                .get('/api/admin/users')
                .query({ limit: 5, filter: 'status="Enabled"', paginationToken: 'prev' })
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.OK);
            expect(mockUserAdminService.listUsers).toHaveBeenCalledWith(expect.anything(), { limit: 5, filter: 'status="Enabled"', paginationToken: 'prev' });
        });

        it('should return 500 if the service fails unexpectedly', async () => {
            const genericError = new Error('List failed');
            mockUserAdminService.listUsers.mockRejectedValueOnce(genericError);
            await request(app)
                .get('/api/admin/users')
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.INTERNAL_SERVER_ERROR); // 500
            expect(mockUserAdminService.listUsers).toHaveBeenCalledTimes(1);
        });
    });

    // --- GET User By Username ---
    describe('GET /api/admin/users/:username', () => {
        const targetUsername = 'get.user.integ@test.com';
        const userMockData: Partial<AdminUserView> = {
            userId: 'get-integ-id',
            username: targetUsername
        };

        it('should return 200 OK with user data if user exists', async () => {
            mockUserAdminService.getUser.mockResolvedValueOnce(userMockData as AdminUserView);
            await request(app)
                .get(`/api/admin/users/${targetUsername}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.OK); // 200
            expect(mockUserAdminService.getUser).toHaveBeenCalledWith(expect.anything(), targetUsername);
        });

        it('should return 404 Not Found if service returns null', async () => {
            mockUserAdminService.getUser.mockResolvedValueOnce(null);
            await request(app)
                .get(`/api/admin/users/${targetUsername}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.NOT_FOUND); // 404
            expect(mockUserAdminService.getUser).toHaveBeenCalledWith(expect.anything(), targetUsername);
        });

        it('should return 404 Not Found if service throws UserNotFoundError', async () => {
            const notFoundError = new UserNotFoundError(`User ${targetUsername}`);
            mockUserAdminService.getUser.mockRejectedValueOnce(notFoundError);
            await request(app)
                .get(`/api/admin/users/${targetUsername}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.NOT_FOUND); // 404
            expect(mockUserAdminService.getUser).toHaveBeenCalledWith(expect.anything(), targetUsername);
        });

        it('should return 500 if the service fails unexpectedly', async () => {
            const genericError = new Error('GetUser failed');
            mockUserAdminService.getUser.mockRejectedValueOnce(genericError);
            await request(app)
                .get(`/api/admin/users/${targetUsername}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.INTERNAL_SERVER_ERROR); // 500
            expect(mockUserAdminService.getUser).toHaveBeenCalledWith(expect.anything(), targetUsername);
        });
    });

    // --- PUT Update User Attributes ---
    describe('PUT /api/admin/users/:username/attributes', () => {
        const targetUsername = 'put.user.integ@test.com';

        it('should return 204 No Content if service succeeds', async () => {
            mockUserAdminService.updateUserAttributes.mockResolvedValueOnce(undefined); // Returns void
            await request(app)
                .put(`/api/admin/users/${targetUsername}/attributes`)
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_UPDATE_ATTRIBUTES_PAYLOAD)
                .expect(HttpStatusCode.NO_CONTENT); // 204

            expect(mockUserAdminService.updateUserAttributes).toHaveBeenCalledTimes(1);
            expect(mockUserAdminService.updateUserAttributes).toHaveBeenCalledWith(
                expect.anything(),
                { username: targetUsername, ...MOCK_UPDATE_ATTRIBUTES_PAYLOAD }
            );
        });

        it('should return 400 Bad Request if update payload is invalid', async () => {
            // Example: sending payload not matching UpdateUserAttributesAdminSchema
            const invalidUpdatePayload = { wrongField: 'some value' };
            await request(app)
                .put(`/api/admin/users/${targetUsername}/attributes`)
                .set(MOCK_AUTH_HEADER)
                .send(invalidUpdatePayload)
                .expect(HttpStatusCode.BAD_REQUEST); // 400 (Assuming validation middleware catches this)
            expect(mockUserAdminService.updateUserAttributes).not.toHaveBeenCalled();
        });

        it('should return 404 Not Found if service throws UserNotFoundError', async () => {
            const notFoundError = new UserNotFoundError(`User ${targetUsername}`);
            mockUserAdminService.updateUserAttributes.mockRejectedValueOnce(notFoundError);
            await request(app)
                .put(`/api/admin/users/${targetUsername}/attributes`)
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_UPDATE_ATTRIBUTES_PAYLOAD)
                .expect(HttpStatusCode.NOT_FOUND); // 404
            expect(mockUserAdminService.updateUserAttributes).toHaveBeenCalledTimes(1);
        });

        it('should return 500 if service fails unexpectedly', async () => {
            const genericError = new Error('Update failed');
            mockUserAdminService.updateUserAttributes.mockRejectedValueOnce(genericError);
            await request(app)
                .put(`/api/admin/users/${targetUsername}/attributes`)
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_UPDATE_ATTRIBUTES_PAYLOAD)
                .expect(HttpStatusCode.INTERNAL_SERVER_ERROR); // 500
            expect(mockUserAdminService.updateUserAttributes).toHaveBeenCalledTimes(1);
        });
    });

    // --- POST Disable User ---
    describe('POST /api/admin/users/:username/disable', () => {
        const targetUsername = 'disable.user.integ@test.com';

        it('should return 200 OK on successful disable', async () => {
            mockUserAdminService.disableUser.mockResolvedValueOnce(undefined);
            await request(app)
                .post(`/api/admin/users/${targetUsername}/disable`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.OK); // 200
            expect(mockUserAdminService.disableUser).toHaveBeenCalledWith(expect.anything(), targetUsername);
        });

        it('should return 404 Not Found if service throws UserNotFoundError', async () => {
            const notFoundError = new UserNotFoundError(`User ${targetUsername}`);
            mockUserAdminService.disableUser.mockRejectedValueOnce(notFoundError);
            await request(app)
                .post(`/api/admin/users/${targetUsername}/disable`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.NOT_FOUND); // 404
            expect(mockUserAdminService.disableUser).toHaveBeenCalledWith(expect.anything(), targetUsername);
        });

        it('should return 500 if service fails unexpectedly', async () => {
            const genericError = new Error('Disable failed');
            mockUserAdminService.disableUser.mockRejectedValueOnce(genericError);
            await request(app)
                .post(`/api/admin/users/${targetUsername}/disable`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.INTERNAL_SERVER_ERROR); // 500
            expect(mockUserAdminService.disableUser).toHaveBeenCalledWith(expect.anything(), targetUsername);
        });
    });

    // --- POST Enable User ---
    describe('POST /api/admin/users/:username/enable', () => {
        const targetUsername = 'enable.user.integ@test.com';

        it('should return 200 OK on successful enable', async () => {
            mockUserAdminService.enableUser.mockResolvedValueOnce(undefined);
            await request(app)
                .post(`/api/admin/users/${targetUsername}/enable`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.OK); // 200
            expect(mockUserAdminService.enableUser).toHaveBeenCalledWith(expect.anything(), targetUsername);
        });

        it('should return 404 Not Found if service throws UserNotFoundError', async () => {
            const notFoundError = new UserNotFoundError(`User ${targetUsername}`);
            mockUserAdminService.enableUser.mockRejectedValueOnce(notFoundError);
            await request(app)
                .post(`/api/admin/users/${targetUsername}/enable`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.NOT_FOUND); // 404
            expect(mockUserAdminService.enableUser).toHaveBeenCalledWith(expect.anything(), targetUsername);
        });

        it('should return 500 if service fails unexpectedly', async () => {
            const genericError = new Error('Enable failed');
            mockUserAdminService.enableUser.mockRejectedValueOnce(genericError);
            await request(app)
                .post(`/api/admin/users/${targetUsername}/enable`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.INTERNAL_SERVER_ERROR); // 500
            expect(mockUserAdminService.enableUser).toHaveBeenCalledWith(expect.anything(), targetUsername);
        });
    });

    // --- POST Initiate Password Reset ---
    describe('POST /api/admin/users/:username/initiate-password-reset', () => {
        const targetUsername = 'resetpw.user.integ@test.com';

        it('should return 200 OK on successful initiation', async () => {
            mockUserAdminService.initiatePasswordReset.mockResolvedValueOnce(undefined);
            await request(app)
                .post(`/api/admin/users/${targetUsername}/initiate-password-reset`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.OK); // 200
            expect(mockUserAdminService.initiatePasswordReset).toHaveBeenCalledWith(expect.anything(), targetUsername);
        });

        it('should return 404 Not Found if service throws UserNotFoundError', async () => {
            const notFoundError = new UserNotFoundError(`User ${targetUsername}`);
            mockUserAdminService.initiatePasswordReset.mockRejectedValueOnce(notFoundError);
            await request(app)
                .post(`/api/admin/users/${targetUsername}/initiate-password-reset`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.NOT_FOUND); // 404
            expect(mockUserAdminService.initiatePasswordReset).toHaveBeenCalledWith(expect.anything(), targetUsername);
        });

        it('should return 500 if service fails unexpectedly', async () => {
            const genericError = new Error('Reset failed');
            mockUserAdminService.initiatePasswordReset.mockRejectedValueOnce(genericError);
            await request(app)
                .post(`/api/admin/users/${targetUsername}/initiate-password-reset`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.INTERNAL_SERVER_ERROR); // 500
            expect(mockUserAdminService.initiatePasswordReset).toHaveBeenCalledWith(expect.anything(), targetUsername);
        });
    });

    // --- POST Set User Password ---
    describe('POST /api/admin/users/:username/set-password', () => {
        const targetUsername = 'setpw.user.integ@test.com';

        it('should return 200 OK on successful password set', async () => {
            mockUserAdminService.setUserPassword.mockResolvedValueOnce(undefined);
            await request(app)
                .post(`/api/admin/users/${targetUsername}/set-password`)
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_SET_PASSWORD_PAYLOAD) // Send password in body
                .expect(HttpStatusCode.OK); // 200
            expect(mockUserAdminService.setUserPassword).toHaveBeenCalledWith(
                expect.anything(),
                targetUsername,
                MOCK_SET_PASSWORD_PAYLOAD.password,
                MOCK_SET_PASSWORD_PAYLOAD.permanent
            );
        });

        it('should return 400 Bad Request if password missing in body', async () => {
            await request(app)
                .post(`/api/admin/users/${targetUsername}/set-password`)
                .set(MOCK_AUTH_HEADER)
                .send({ permanent: true }) // Missing password
                .expect(HttpStatusCode.BAD_REQUEST); // 400 (Assuming validation middleware catches this)
            expect(mockUserAdminService.setUserPassword).not.toHaveBeenCalled();
        });

        it('should return 404 Not Found if service throws UserNotFoundError', async () => {
            const notFoundError = new UserNotFoundError(`User ${targetUsername}`);
            mockUserAdminService.setUserPassword.mockRejectedValueOnce(notFoundError);
            await request(app)
                .post(`/api/admin/users/${targetUsername}/set-password`)
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_SET_PASSWORD_PAYLOAD)
                .expect(HttpStatusCode.NOT_FOUND); // 404
            expect(mockUserAdminService.setUserPassword).toHaveBeenCalledTimes(1);
        });

        it('should return 500 if service fails unexpectedly', async () => {
            const genericError = new Error('Set PW failed');
            mockUserAdminService.setUserPassword.mockRejectedValueOnce(genericError);
            await request(app)
                .post(`/api/admin/users/${targetUsername}/set-password`)
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_SET_PASSWORD_PAYLOAD)
                .expect(HttpStatusCode.INTERNAL_SERVER_ERROR); // 500
            expect(mockUserAdminService.setUserPassword).toHaveBeenCalledTimes(1);
        });
    });

    // --- Group Management Tests ---
    describe('User Group Management', () => {
        const targetUsername = 'group.user.integ@test.com';

        describe('POST /api/admin/users/:username/groups', () => {
            it('should return 200 OK when adding user to group succeeds', async () => {
                mockUserAdminService.addUserToGroup.mockResolvedValueOnce(undefined);
                await request(app)
                    .post(`/api/admin/users/${targetUsername}/groups`)
                    .set(MOCK_AUTH_HEADER)
                    .send(MOCK_ADD_GROUP_PAYLOAD) // groupName in body
                    .expect(HttpStatusCode.OK); // 200
                expect(mockUserAdminService.addUserToGroup).toHaveBeenCalledWith(expect.anything(), targetUsername, MOCK_ADD_GROUP_PAYLOAD.groupName);
            });

            it('should return 400 Bad Request if groupName missing', async () => {
                await request(app)
                    .post(`/api/admin/users/${targetUsername}/groups`)
                    .set(MOCK_AUTH_HEADER)
                    .send({}) // Missing groupName
                    .expect(HttpStatusCode.BAD_REQUEST); // 400
                expect(mockUserAdminService.addUserToGroup).not.toHaveBeenCalled();
            });

            it('should return 404 Not Found if user/group not found (via service error)', async () => {
                const notFoundError = new NotFoundError(`User or Group`); // Generic NotFound from service
                mockUserAdminService.addUserToGroup.mockRejectedValueOnce(notFoundError);
                await request(app)
                    .post(`/api/admin/users/${targetUsername}/groups`)
                    .set(MOCK_AUTH_HEADER)
                    .send(MOCK_ADD_GROUP_PAYLOAD)
                    .expect(HttpStatusCode.NOT_FOUND); // 404
                expect(mockUserAdminService.addUserToGroup).toHaveBeenCalledTimes(1);
            });
            // Add test for UserAlreadyInGroupError if service throws it
            // Add test for generic 500 error
        });

        describe('GET /api/admin/users/:username/groups', () => {
            it('should return 200 OK and list groups for user', async () => {
                const mockGroups = [{ GroupName: testGroupName, Description: 'Test Desc' }];
                mockUserAdminService.listGroupsForUser.mockResolvedValueOnce({ groups: mockGroups as any, nextToken: undefined });
                await request(app)
                    .get(`/api/admin/users/${targetUsername}/groups`)
                    .set(MOCK_AUTH_HEADER)
                    .expect(HttpStatusCode.OK); // 200
                expect(mockUserAdminService.listGroupsForUser).toHaveBeenCalledWith(expect.anything(), targetUsername, undefined, undefined);
            });

            it('should return 404 if user not found (via service error)', async () => {
                const notFoundError = new UserNotFoundError(`User ${targetUsername}`);
                mockUserAdminService.listGroupsForUser.mockRejectedValueOnce(notFoundError);
                await request(app)
                    .get(`/api/admin/users/${targetUsername}/groups`)
                    .set(MOCK_AUTH_HEADER)
                    .expect(HttpStatusCode.NOT_FOUND); // 404
                expect(mockUserAdminService.listGroupsForUser).toHaveBeenCalledTimes(1);
            });
            // Add test for generic 500 error
        });

        describe('DELETE /api/admin/users/:username/groups/:groupName', () => {
            it('should return 204 No Content when removing user from group', async () => {
                mockUserAdminService.removeUserFromGroup.mockResolvedValueOnce(undefined);
                await request(app)
                    .delete(`/api/admin/users/${targetUsername}/groups/${testGroupName}`)
                    .set(MOCK_AUTH_HEADER)
                    .expect(HttpStatusCode.NO_CONTENT); // 204
                expect(mockUserAdminService.removeUserFromGroup).toHaveBeenCalledWith(expect.anything(), targetUsername, testGroupName);
            });

            it('should return 404 if user/group not found (via service error)', async () => {
                const notFoundError = new NotFoundError(`User or Group`);
                mockUserAdminService.removeUserFromGroup.mockRejectedValueOnce(notFoundError);
                await request(app)
                    .delete(`/api/admin/users/${targetUsername}/groups/${testGroupName}`)
                    .set(MOCK_AUTH_HEADER)
                    .expect(HttpStatusCode.NOT_FOUND); // 404
                expect(mockUserAdminService.removeUserFromGroup).toHaveBeenCalledTimes(1);
            });
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

        it('should return 204 No Content if service succeeds', async () => {
            mockUserAdminService.deleteUser.mockResolvedValueOnce(undefined);
            await request(app)
                .delete(`/api/admin/users/${targetUsername}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.NO_CONTENT); // 204
            expect(mockUserAdminService.deleteUser).toHaveBeenCalledWith(expect.anything(), targetUsername);
        });

        it('should return 404 Not Found if service throws UserNotFoundError', async () => {
            const notFoundError = new UserNotFoundError(`User ${targetUsername}`);
            mockUserAdminService.deleteUser.mockRejectedValueOnce(notFoundError);
            await request(app)
                .delete(`/api/admin/users/${targetUsername}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.NOT_FOUND); // 404
            expect(mockUserAdminService.deleteUser).toHaveBeenCalledWith(expect.anything(), targetUsername);
        });

        it('should return 500 if service fails unexpectedly', async () => {
            const genericError = new Error('Delete failed');
            mockUserAdminService.deleteUser.mockRejectedValueOnce(genericError);
            await request(app)
                .delete(`/api/admin/users/${targetUsername}`)
                .set(MOCK_AUTH_HEADER)
                .expect(HttpStatusCode.INTERNAL_SERVER_ERROR); // 500
            expect(mockUserAdminService.deleteUser).toHaveBeenCalledWith(expect.anything(), targetUsername);
        });
    });

}); // End Test Suite