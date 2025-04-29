import { Express } from 'express';
import 'reflect-metadata'; // Must be first
import request from 'supertest';

// --- SDK Mocking Setup ---
import {
    CognitoIdentityProviderClient
} from "@aws-sdk/client-cognito-identity-provider";
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest'; // Optional: Extends Jest matchers like toHaveBeenSentWith

// Create the SDK mock instance ONCE
const cognitoMock = mockClient(CognitoIdentityProviderClient);
// --- End SDK Mocking Setup ---


// Other imports AFTER SDK mock setup potentially
import { createApp } from '../../src/app'; // Adjust path
import { HttpStatusCode } from '../../src/application/enums/HttpStatusCode'; // Adjust path
import { IConfigService } from '../../src/application/interfaces/IConfigService';
import { ILogger } from '../../src/application/interfaces/ILogger';
import { IUserAdminService } from '../../src/application/interfaces/IUserAdminService';
// No longer need IUserMgmtAdapter interface directly here
import { container } from '../../src/container'; // Adjust path
import { AdminUserView } from '../../src/domain/entities/AdminUserView';
import { WinstonLogger } from '../../src/infrastructure/logging/WinstonLogger'; // Example Logger impl
import { TYPES } from '../../src/shared/constants/types';
import { BaseError, NotFoundError } from '../../src/shared/errors/BaseError'; // Adjust path


// Define the bypass token
const TEST_ADMIN_TOKEN = 'Bearer valid-test-token-for-admin-bypass-12345';

const createUserPayload = {
    username: 'valid.user@test.com',
    email: 'valid.user@test.com', // Keep top-level if needed elsewhere
    // temporaryPassword can be omitted if schema allows optional
    temporaryPassword: 'ValidPassword123!',
    userAttributes: { // MUST BE OBJECT
        "email": "valid.user@test.com", // REQUIRED by refine
        "custom:department": "Testing",
        "name": "Valid User"
        // Add other necessary attributes
    },
    groups: ['testers'], // Optional
};


// --- Mock Service Layer (Still primary mock) ---
const mockUserAdminService: jest.Mocked<IUserAdminService> = {
    createUser: jest.fn(), listUsers: jest.fn(), getUser: jest.fn(), updateUserAttributes: jest.fn(), deleteUser: jest.fn(), disableUser: jest.fn(), enableUser: jest.fn(), initiatePasswordReset: jest.fn(), setUserPassword: jest.fn(), addUserToGroup: jest.fn(), removeUserFromGroup: jest.fn(), listGroupsForUser: jest.fn(), listUsersInGroup: jest.fn(),
};

// --- Mock Config Service (Still needed for app setup) ---
const mockConfigService: jest.Mocked<IConfigService> = {
    // ... (full implementation as corrected before)
    get: jest.fn((key: string, defaultValue?: any) => process.env[key] ?? defaultValue),
    getNumber: jest.fn((key: string, defaultValue?: number): number | undefined => { const v = process.env[key]; const n = parseInt(v || '', 10); return isNaN(n) ? defaultValue : n; }),
    getBoolean: jest.fn((key: string, defaultValue?: boolean): boolean | undefined => { const v = (process.env[key] || '').toLowerCase(); if (v === 'true') return true; if (v === 'false') return false; return defaultValue; }),
    isDevelopment: jest.fn(() => process.env['NODE_ENV'] === 'development'),
    isProduction: jest.fn(() => process.env['NODE_ENV'] === 'production'),
    isTest: jest.fn(() => process.env['NODE_ENV'] === 'test'),
    getAllConfig: jest.fn(() => ({ /* ... */ })),
    has: jest.fn((key: string): boolean => process.env[key] !== undefined),
};

describe('Integration Tests: User Admin Routes (/api/admin/users)', () => {
    let app: Express;
    let logger: ILogger;

    beforeAll(() => {
        process.env.NODE_ENV = 'test'; // Ensure set

        container.reset();
        container.clearInstances();

        // Register mocks for dependencies NEEDED BY CONTROLLERS/MIDDLEWARE
        container.registerInstance<IConfigService>(TYPES.ConfigService, mockConfigService);
        container.registerSingleton<ILogger>(TYPES.Logger, WinstonLogger);
        // *** PRIMARY MOCK: Mock the service interface ***
        container.registerInstance<IUserAdminService>(TYPES.UserAdminService, mockUserAdminService);

        // *** DO NOT register IUserMgmtAdapter mock via DI ***
        // Let the container resolve the real adapter binding.
        // The real adapter's constructor WILL run, but aws-sdk-client-mock
        // patches the cognitoClient.send method internally, preventing real AWS calls.

        logger = container.resolve<ILogger>(TYPES.Logger);
        logger.debug('AWS SDK Client Mocked. Service/Config mocks registered.');

        // Create app AFTER container setup and SDK mock initialization
        app = createApp();
        logger.debug('Test Express app created.');
    });


    beforeEach(() => {
        // Reset mock function calls before each test
        cognitoMock.reset();
        jest.clearAllMocks();
    });

    afterAll(() => {
        container.reset();
        container.clearInstances();
    });

    // --- Authentication Tests ---
    describe('Authentication', () => {
        it('should return 401 Unauthorized if no token is provided', async () => {
            await request(app)
                .get('/api/admin/users')
                .expect(HttpStatusCode.UNAUTHORIZED);
        });

        it('should return 401 Unauthorized if an invalid token is provided', async () => {
            await request(app)
                .get('/api/admin/users')
                .set('Authorization', 'Bearer invalid-token')
                .expect(HttpStatusCode.UNAUTHORIZED);
            // In test env, this falls through the bypass and fails standard validation
        });

        it('should allow access with the correct test bypass token', async () => {
            mockUserAdminService.listUsers.mockResolvedValueOnce({ users: [], paginationToken: undefined });
            logger.debug('Making request to GET /api/admin/users');
            await request(app)
                .get('/api/admin/users')
                .set('Authorization', TEST_ADMIN_TOKEN)
                .expect(HttpStatusCode.OK); // Expect 200

            expect(mockUserAdminService.listUsers).toHaveBeenCalledTimes(1);
            // Adapter should not be called directly if service is mocked properly
        });
    });

    // --- Route Tests (Example: Create User) ---
    describe('POST /api/admin/users', () => {

        it('should return 201 Created when user creation is successful', async () => {
            const createdUserMock: AdminUserView = {
                userId: 'uuid-goes-here', // Assuming AdminUserView has userId
                username: createUserPayload.username,
                status: 'FORCE_CHANGE_PASSWORD',
                enabled: true,
                attributes: {
                    sub: 'uuid-goes-here',
                    email_verified: 'true',
                    email: createUserPayload.email,
                    'custom:department': 'Engineering' // Flatten attributes if AdminUserView expects that
                },
                email: 'abc@domain.com',
                emailVerified: false,
                phoneNumber: undefined,
                phoneVerified: false,
                createdAt: new Date(),
                updatedAt: new Date(),
                groups: ['testers'],
            };
            // Ensure the mock resolves with the correctly typed object
            mockUserAdminService.createUser.mockResolvedValueOnce(createdUserMock);

            const response = await request(app)
                .post('/api/admin/users')
                .set('Authorization', TEST_ADMIN_TOKEN)
                .send(createUserPayload)
                .expect(HttpStatusCode.CREATED)
                .expect('Content-Type', /json/);

            expect(response.body).toHaveProperty('username', createdUserMock.username);
            expect(response.body).toHaveProperty('status', createdUserMock.status);
            // Add more assertions based on your expected response structure
            expect(mockUserAdminService.createUser).toHaveBeenCalledTimes(1);
            expect(mockUserAdminService.createUser).toHaveBeenCalledWith(createUserPayload);
        });

        it('should return 400 Bad Request if validation fails (e.g., missing username)', async () => {
            // const invalidPayload = { ...createUserPayload, username: undefined };
            const invalidPayload = {
                // username is missing
                email: 'valid-email@test.com', // Use a valid email here
                temporaryPassword: 'short', // Invalid password
                userAttributes: {
                    // email attribute is missing
                    "custom:department": "Testing"
                }
            };
            const response = await request(app)
                .post('/api/admin/users')
                .set('Authorization', TEST_ADMIN_TOKEN)
                .send(invalidPayload)
                .expect(HttpStatusCode.BAD_REQUEST)
                .expect('Content-Type', /json/);

            expect(response.body).toHaveProperty('status', 'error');
            expect(response.body).toHaveProperty('name', 'ValidationError');
            expect(response.body).toHaveProperty('message', 'Input validation failed'); // Check this message
            expect(response.body).toHaveProperty('details');
            const details = response.body.details;
            expect(details).toBeInstanceOf(Object);
            // --- REVISED ASSERTIONS ---
            expect(Object.keys(details)).toContain('body.username'); // Check key existence
            expect(details['body.username']).toContain('required'); // Check message

            expect(Object.keys(details)).toContain('body.temporaryPassword');
            expect(details['body.temporaryPassword']).toMatch(/at least 8|too short/i);

            expect(Object.keys(details)).toContain('body.userAttributes.email');
            expect(details['body.userAttributes.email']).toContain('required');
            // --- END REVISED ASSERTIONS ---

            expect(mockUserAdminService.createUser).not.toHaveBeenCalled();
        });

        it('should return 500 Internal Server Error if service throws an unexpected error', async () => {
            mockUserAdminService.createUser.mockRejectedValueOnce(new Error('Internal service failure'));

            const response = await request(app)
                .post('/api/admin/users')
                .set('Authorization', TEST_ADMIN_TOKEN)
                .send(createUserPayload)
                .expect(HttpStatusCode.INTERNAL_SERVER_ERROR)
                .expect('Content-Type', /json/);

            expect(response.body).toHaveProperty('status', 'error');
            expect(response.body).toHaveProperty('message', 'An unexpected error occurred.'); // Check your error middleware's generic message
            expect(mockUserAdminService.createUser).toHaveBeenCalledTimes(1);
        });

        it('should return 409 Conflict if service throws a specific domain error (e.g., UserExistsError)', async () => {
            // Assume UserExistsError inherits from BaseError or is handled specifically
            const conflictError = new BaseError('UserExistsError', HttpStatusCode.CONFLICT, 'User already exists', true);
            mockUserAdminService.createUser.mockRejectedValueOnce(conflictError);

            const response = await request(app)
                .post('/api/admin/users')
                .set('Authorization', TEST_ADMIN_TOKEN)
                .send(createUserPayload)
                .expect(HttpStatusCode.CONFLICT)
                .expect('Content-Type', /json/);

            expect(response.body).toHaveProperty('status', 'error');
            expect(response.body).toHaveProperty('name', 'UserExistsError');
            expect(response.body).toHaveProperty('message', 'User already exists');
            expect(mockUserAdminService.createUser).toHaveBeenCalledTimes(1);
        });
    });

    // --- Route Tests (Example: Get User) ---
    describe('GET /api/admin/users/:username', () => {
        const testUsername = 'existinguser@test.com';
        const userMockData = {
            userId: 'uuid-goes-here', // Assuming AdminUserView has userId
            username: 'newUserName',
            status: 'FORCE_CHANGE_PASSWORD',
            enabled: true,
            attributes: {
                sub: 'uuid-goes-here',
                email_verified: 'true',
                email: 'email@domain.com',
                'custom:department': 'Engineering' // Flatten attributes if AdminUserView expects that
            },
            email: 'abc@domain.com',
            emailVerified: false,
            phoneNumber: undefined,
            phoneVerified: false,
            createdAt: new Date(),
            updatedAt: new Date(),
            groups: ['testers'],
        };

        it('should return 200 OK and user data if user exists', async () => {
            // Ensure the mock resolves with the correctly typed object or null
            mockUserAdminService.getUser.mockResolvedValueOnce(userMockData);

            const response = await request(app)
                .get(`/api/admin/users/${testUsername}`)
                .set('Authorization', TEST_ADMIN_TOKEN)
                .expect(HttpStatusCode.OK) // 200
                .expect('Content-Type', /json/);

            expect(response.body).toHaveProperty('username', testUsername);
            expect(response.body).toHaveProperty('userId', userMockData.userId);
            expect(mockUserAdminService.getUser).toHaveBeenCalledTimes(1);
            expect(mockUserAdminService.getUser).toHaveBeenCalledWith(testUsername);
        });

        it('should return 404 Not Found if user does not exist', async () => {
            const notFoundError = new NotFoundError(`User ${testUsername} not found.`);
            mockUserAdminService.getUser.mockRejectedValueOnce(notFoundError);

            const response = await request(app)
                .get(`/api/admin/users/${testUsername}`)
                .set('Authorization', TEST_ADMIN_TOKEN)
                .expect(HttpStatusCode.NOT_FOUND)
                .expect('Content-Type', /json/);

            expect(response.body).toHaveProperty('status', 'error');
            expect(response.body).toHaveProperty('name', 'NotFoundError'); // Or whatever your error middleware maps it to
            expect(response.body).toHaveProperty('message', notFoundError.message);
            expect(mockUserAdminService.getUser).toHaveBeenCalledTimes(1);
            expect(mockUserAdminService.getUser).toHaveBeenCalledWith(testUsername);
        });
    });

    // --- Add more tests for other routes (List, Update, Delete, Group actions etc.) following similar patterns ---
    // - Test success cases (mock service resolves)
    // - Test validation errors (send invalid data)
    // - Test specific error handling (mock service rejects with known errors like NotFoundError)
    // - Test generic error handling (mock service rejects with generic Error)
    // - Test authentication/authorization failure (omit token or use invalid one)

});