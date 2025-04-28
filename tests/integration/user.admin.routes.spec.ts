import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../../src/app';
import { HttpStatusCode } from '../../src/application/enums/HttpStatusCode';

// --- AWS SDK Mocking ---
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest'; // Provides useful matchers like toHaveReceivedCommandWith
import {
    CognitoIdentityProviderClient,
    AdminCreateUserCommand,
    AdminGetUserCommand,
    ListUsersCommand,
    AdminUpdateUserAttributesCommand,
    AdminDeleteUserCommand,
    AdminDisableUserCommand,
    AdminEnableUserCommand,
    AdminResetUserPasswordCommand,
    AdminSetUserPasswordCommand,
    AdminAddUserToGroupCommand,
    AdminListGroupsForUserCommand,
    AdminRemoveUserFromGroupCommand,
    // Import Exceptions
    UsernameExistsException,
    UserNotFoundException,
    InvalidPasswordException,
    InvalidParameterException,
    ResourceNotFoundException,
    // Import Types including UserStatusType
    UserType,
    UserStatusType, // <<< IMPORT ENUM
    GroupType,
    ListUsersCommandOutput
} from '@aws-sdk/client-cognito-identity-provider';

// Instantiate the mock for the Cognito client USED by the adapter
const cognitoMock = mockClient(CognitoIdentityProviderClient);
// --- End AWS SDK Mocking ---


// --- Test Data (Keep as before) ---
const testUsername = `test-user-${Date.now()}@example.com`;
const testPassword = 'Password123!';
const testGroupName = `TestGroup-${Date.now()}`;

const MOCK_NEW_USER_PAYLOAD = {
    username: testUsername,
    temporaryPassword: testPassword,
    userAttributes: { email: testUsername, email_verified: 'true', given_name: 'Test', family_name: 'User', 'custom:tenantId': 'integ-test-tenant' },
};
const MOCK_UPDATE_ATTRIBUTES_PAYLOAD = { attributesToUpdate: { given_name: 'UpdatedFirstName', family_name: 'UpdatedLastName', 'custom:role': 'tester' } };
const MOCK_SET_PASSWORD_PAYLOAD = { password: 'NewSecurePassword456!', permanent: true };
const MOCK_ADD_GROUP_PAYLOAD = { groupName: testGroupName };

const TEST_AUTH_BYPASS_TOKEN = 'valid-test-token-for-admin-bypass-12345';
const MOCK_AUTH_HEADER = { Authorization: `Bearer ${TEST_AUTH_BYPASS_TOKEN}` };
// --- End Test Data ---


describe('User Admin API Integration (/api/admin/users routes)', () => {
    let app: Express;
    const targetUsername = testUsername; // Use this for consistency in tests

    beforeAll(() => {
        // Env vars should be set by jest.setup.ts
        app = createApp();
    });

    // Reset AWS SDK mocks before each test
    beforeEach(() => {
        cognitoMock.reset();
    });

    // No afterAll needed if SDK is mocked

    describe('POST /api/admin/users', () => {
        it('should return 201 and the created user when payload is valid and authorized', async () => {
            // Mock the successful Cognito response for AdminCreateUserCommand
            const mockCognitoResponse = {
                User: {
                    Username: targetUsername,
                    Enabled: true,
                    UserStatus: 'FORCE_CHANGE_PASSWORD',
                    Attributes: [{ Name: 'email', Value: targetUsername } /* other attrs */],
                } as UserType,
            };
            cognitoMock.on(AdminCreateUserCommand).resolves(mockCognitoResponse);

            const res = await request(app)
                .post('/api/admin/users')
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_NEW_USER_PAYLOAD);

            // Assertions expect 201 because the mocked SDK call succeeded
            expect(res.status).toBe(HttpStatusCode.CREATED);
            expect(res.body).toBeDefined();
            expect(res.body.Username).toBe(targetUsername);
            expect(res.body.UserStatus).toBe('FORCE_CHANGE_PASSWORD');
            expect(cognitoMock).toHaveReceivedCommandTimes(AdminCreateUserCommand, 1); // Verify SDK interaction
        });

        it('should return 400 Bad Request if payload is invalid (e.g., missing username)', async () => {
            // No SDK mock needed, validation middleware catches this
            const { username, ...invalidPayload } = MOCK_NEW_USER_PAYLOAD;
            const res = await request(app)
                .post('/api/admin/users')
                .set(MOCK_AUTH_HEADER)
                .send(invalidPayload);

            expect(res.status).toBe(HttpStatusCode.BAD_REQUEST);
            expect(res.body?.error?.issues).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ path: ['body', 'username'] })
                ])
            );
            expect(cognitoMock).toHaveReceivedCommandTimes(AdminCreateUserCommand, 0); // Ensure SDK wasn't called
        });

        it('should return 400 Bad Request if password is weak (if policy exists)', async () => {
            // Mock Cognito rejecting the password via the adapter's error handling
            const cognitoError = new InvalidPasswordException({ message: 'Password weak', $metadata: {} });
            cognitoMock.on(AdminCreateUserCommand).rejects(cognitoError);

            const weakPasswordPayload = { ...MOCK_NEW_USER_PAYLOAD, temporaryPassword: '123' };
            const res = await request(app)
                .post('/api/admin/users')
                .set(MOCK_AUTH_HEADER)
                .send(weakPasswordPayload);

            // Expect 400 because adapter maps InvalidPasswordException -> ValidationError
            expect(res.status).toBe(HttpStatusCode.BAD_REQUEST);
            expect(res.body?.message).toContain('Password weak'); // Check mapped error message
            expect(cognitoMock).toHaveReceivedCommandTimes(AdminCreateUserCommand, 1);
        });

        it('should return 401 Unauthorized if auth token is missing', async () => {
            // No SDK mock needed
            const res = await request(app)
                .post('/api/admin/users')
                .send(MOCK_NEW_USER_PAYLOAD);
            expect(res.status).toBe(HttpStatusCode.UNAUTHORIZED);
            expect(cognitoMock).toHaveReceivedCommandTimes(AdminCreateUserCommand, 0);
        });

        it('should return 400 Bad Request if username already exists', async () => {
            // Mock Cognito rejecting with UsernameExistsException
            const cognitoError = new UsernameExistsException({ message: 'User exists', $metadata: {} });
            cognitoMock.on(AdminCreateUserCommand).rejects(cognitoError);

            const res = await request(app)
                .post('/api/admin/users')
                .set(MOCK_AUTH_HEADER)
                .send(MOCK_NEW_USER_PAYLOAD); // Use payload for potentially existing user

            // Expect 400 because adapter maps UsernameExistsException -> ValidationError
            expect(res.status).toBe(HttpStatusCode.BAD_REQUEST);
            expect(res.body?.message).toContain('Username already exists');
            expect(cognitoMock).toHaveReceivedCommandTimes(AdminCreateUserCommand, 1);
        });
    });

    // --- Apply Mocks to ALL other test blocks similarly ---

    describe('GET /api/admin/users', () => {
        it('should return 200 and a list of users when authorized', async () => {
            // Mock ListUsersCommand success
            const mockUsersResponse: ListUsersCommandOutput = {
                Users: [{ Username: targetUsername, Attributes: [], Enabled: true, UserStatus: 'CONFIRMED' }],
                PaginationToken: undefined,
                $metadata: {} // Add metadata if needed
            };
            cognitoMock.on(ListUsersCommand).resolves(mockUsersResponse);

            const res = await request(app)
                .get('/api/admin/users?limit=5')
                .set(MOCK_AUTH_HEADER);

            expect(res.status).toBe(HttpStatusCode.OK);
            expect(res.body).toEqual({ // Expect the structure returned by your adapter/service
                users: mockUsersResponse.Users,
                paginationToken: mockUsersResponse.PaginationToken
            });
            expect(cognitoMock).toHaveReceivedCommandTimes(ListUsersCommand, 1);
            expect(cognitoMock).toHaveReceivedCommandWith(ListUsersCommand, { Limit: 5 }); // Check query param mapping
        });

        it('should return 400 Bad Request if query params are invalid', async () => {
            // No SDK mock needed, validation middleware catches this
            const res = await request(app)
                .get('/api/admin/users?limit=abc')
                .set(MOCK_AUTH_HEADER);
            expect(res.status).toBe(HttpStatusCode.BAD_REQUEST);
            expect(res.body?.error?.issues).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ path: ['query', 'limit'] })
                ])
            );
            expect(cognitoMock).toHaveReceivedCommandTimes(ListUsersCommand, 0);
        });

        it('should return 401 Unauthorized if auth token is missing', async () => {
            // No SDK mock needed
            const res = await request(app).get('/api/admin/users');
            expect(res.status).toBe(HttpStatusCode.UNAUTHORIZED);
            expect(cognitoMock).toHaveReceivedCommandTimes(ListUsersCommand, 0);
        });
    });

    describe('GET /api/admin/users/:username', () => {
        it('should return 200 and the specific user if username exists and authorized', async () => {
            const mockUser: UserType = { Username: targetUsername, Attributes: [{ Name: 'email', Value: targetUsername }], Enabled: true, UserStatus: 'CONFIRMED' };
            // AdminGetUserCommand returns slightly different structure than ListUsers
            cognitoMock.on(AdminGetUserCommand).resolves({
                Username: mockUser.Username, UserAttributes: mockUser.Attributes, Enabled: mockUser.Enabled, UserStatus: mockUser.UserStatus, $metadata: {}
            });

            const res = await request(app)
                .get(`/api/admin/users/${targetUsername}`)
                .set(MOCK_AUTH_HEADER);

            expect(res.status).toBe(HttpStatusCode.OK);
            // The adapter maps the response, check the final structure returned by controller
            expect(res.body).toEqual(expect.objectContaining({ Username: targetUsername }));
            expect(cognitoMock).toHaveReceivedCommandWith(AdminGetUserCommand, { Username: targetUsername });
        });

        it('should return 404 Not Found if username does not exist', async () => {
            const cognitoError = new UserNotFoundException({ message: 'User not found', $metadata: {} });
            cognitoMock.on(AdminGetUserCommand).rejects(cognitoError);
            const nonExistentUsername = 'non-existent-user@example.com';

            const res = await request(app)
                .get(`/api/admin/users/${nonExistentUsername}`)
                .set(MOCK_AUTH_HEADER);

            expect(res.status).toBe(HttpStatusCode.NOT_FOUND);
            expect(res.body?.message).toContain(`User '${nonExistentUsername}' not found`);
            expect(cognitoMock).toHaveReceivedCommandWith(AdminGetUserCommand, { Username: nonExistentUsername });
        });

        it('should return 401 Unauthorized if auth token is missing', async () => {
            // No SDK mock needed
            const res = await request(app).get(`/api/admin/users/${targetUsername}`);
            expect(res.status).toBe(HttpStatusCode.UNAUTHORIZED);
            expect(cognitoMock).toHaveReceivedCommandTimes(AdminGetUserCommand, 0);
        });
    });

    // --- Continue this pattern for ALL other endpoints ---
    // PUT /attributes, DELETE user, enable/disable, password ops, group ops
    // Mock the relevant Cognito command (e.g., AdminUpdateUserAttributesCommand)
    // Mock success (.resolves({})) and specific errors (.rejects(new ...Exception(...)))
    // Assert the expected status code based on error mapping (400, 404, 204 etc.)
    // Verify SDK commands were called/not called

}); // End describe block