import { CognitoIdentityProviderClient, AdminCreateUserCommand, AdminGetUserCommand, AdminUpdateUserAttributesCommand, AdminDeleteUserCommand, UserNotFoundException, UsernameExistsException, InvalidParameterException } from '@aws-sdk/client-cognito-identity-provider';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest'; // Extends Jest expect

import { CognitoUserMgmtAdapter } from '../../../../../src/infrastructure/adapters/cognito/CognitoUserMgmtAdapter';
// Assuming you might have custom error types or domain objects
// import { UserNotFoundError, UserAlreadyExistsError, InvalidRequestError } from '../../../../../src/domain/errors';
// import { User } from '../../../../../src/domain/entities/User'; // Assuming a User entity

// --- Mock Configuration ---
// Replace with your actual configuration structure if needed
interface MockCognitoConfig {
    region: string;
    userPoolId: string;
    // Add other config properties if your adapter uses them
}

const mockConfig: MockCognitoConfig = {
    region: 'us-east-1',
    userPoolId: 'us-east-1_testPoolId',
};

// --- Mocks ---
const cognitoMock = mockClient(CognitoIdentityProviderClient);

describe('CognitoUserMgmtAdapter', () => {
    let adapter: CognitoUserMgmtAdapter;

    beforeEach(() => {
        // Reset mocks before each test
        cognitoMock.reset();

        // Instantiate the adapter with mocked dependencies/config
        // We pass the actual client constructor, but mockClient intercepts calls
        adapter = new CognitoUserMgmtAdapter(mockConfig.userPoolId, new CognitoIdentityProviderClient({ region: mockConfig.region }));
    });

    it('should be defined', () => {
        expect(adapter).toBeDefined();
    });

    // --- Test createUser ---
    describe('createUser', () => {
        const testEmail = 'test@example.com';
        const testPassword = 'Password123!';
        const userAttributes = [
            { Name: 'email', Value: testEmail },
            { Name: 'email_verified', Value: 'true' },
            { Name: 'custom:tenantId', Value: 'tenant-123' },
        ];

        it('should create a user successfully', async () => {
            const mockCognitoResponse = {
                User: {
                    Username: 'cognito-uuid-123',
                    Attributes: userAttributes,
                    UserCreateDate: new Date(),
                    UserLastModifiedDate: new Date(),
                    Enabled: true,
                    UserStatus: 'FORCE_CHANGE_PASSWORD',
                },
            };
            cognitoMock.on(AdminCreateUserCommand).resolves(mockCognitoResponse);

            const result = await adapter.createUser(testEmail, testPassword, [{ name: 'custom:tenantId', value: 'tenant-123' }]);

            // Basic check - adapt based on what your method actually returns
            expect(result).toBeDefined();
            expect(result.userId).toEqual('cognito-uuid-123'); // Assuming it returns an object with userId
            expect(result.email).toEqual(testEmail);
            expect(result.status).toEqual('FORCE_CHANGE_PASSWORD');


            // Verify the command was called correctly
            expect(cognitoMock).toHaveReceivedCommandWith(AdminCreateUserCommand, {
                UserPoolId: mockConfig.userPoolId,
                Username: testEmail, // Assuming username is email by default
                TemporaryPassword: testPassword,
                UserAttributes: expect.arrayContaining([
                    { Name: 'email', Value: testEmail },
                    { Name: 'email_verified', Value: 'true' }, // Assuming adapter sets this
                    { Name: 'custom:tenantId', Value: 'tenant-123' },
                ]),
                DesiredDeliveryMediums: ['EMAIL'], // Assuming adapter sets this
                ForceAliasCreation: true, // Common setting
            });
        });

        it('should throw UserAlreadyExistsError if username exists', async () => {
            const cognitoError = new UsernameExistsException({
                message: 'User already exists',
                $metadata: {},
            });
            cognitoMock.on(AdminCreateUserCommand).rejects(cognitoError);

            // Adapt the expected error type if you have custom errors
            await expect(adapter.createUser(testEmail, testPassword, []))
                .rejects
                // .toThrow(UserAlreadyExistsError); // Example custom error
                .toThrow(UsernameExistsException); // Or re-throws the original
        });

        it('should throw InvalidRequestError for invalid parameters', async () => {
            const cognitoError = new InvalidParameterException({
                message: 'Invalid parameter',
                $metadata: {},
            });
            cognitoMock.on(AdminCreateUserCommand).rejects(cognitoError);

            await expect(adapter.createUser(testEmail, 'short', [])) // Example invalid input
                .rejects
                // .toThrow(InvalidRequestError); // Example custom error
                .toThrow(InvalidParameterException); // Or re-throws the original
        });

         it('should handle generic errors during user creation', async () => {
            const genericError = new Error('Something went wrong');
            cognitoMock.on(AdminCreateUserCommand).rejects(genericError);

            await expect(adapter.createUser(testEmail, testPassword, []))
                .rejects
                .toThrow('Something went wrong');
        });
    });

    // --- Test getUserByUsername ---
    describe('getUserByUsername', () => {
        const testUsername = 'test@example.com'; // Or a UUID if that's your username

        it('should return user data if user exists', async () => {
            const mockCognitoResponse = {
                Username: testUsername,
                UserAttributes: [
                    { Name: 'sub', Value: 'cognito-uuid-123' },
                    { Name: 'email', Value: testUsername },
                    { Name: 'email_verified', Value: 'true' },
                    { Name: 'custom:tenantId', Value: 'tenant-456' },
                ],
                UserCreateDate: new Date(),
                UserLastModifiedDate: new Date(),
                Enabled: true,
                UserStatus: 'CONFIRMED',
            };
            cognitoMock.on(AdminGetUserCommand).resolves(mockCognitoResponse);

            const result = await adapter.getUserByUsername(testUsername);

            // Basic check - adapt based on what your method actually returns
            expect(result).toBeDefined();
            expect(result?.userId).toEqual('cognito-uuid-123'); // Assuming mapping 'sub' to userId
            expect(result?.email).toEqual(testUsername);
            expect(result?.status).toEqual('CONFIRMED');
            expect(result?.attributes).toEqual(expect.objectContaining({ 'custom:tenantId': 'tenant-456' }));


            expect(cognitoMock).toHaveReceivedCommandWith(AdminGetUserCommand, {
                UserPoolId: mockConfig.userPoolId,
                Username: testUsername,
            });
        });

        it('should return null (or throw UserNotFoundError) if user does not exist', async () => {
            const cognitoError = new UserNotFoundException({
                message: 'User not found',
                $metadata: {},
            });
            cognitoMock.on(AdminGetUserCommand).rejects(cognitoError);

            // Option 1: Adapter returns null
            const result = await adapter.getUserByUsername(testUsername);
            expect(result).toBeNull();

            // Option 2: Adapter throws custom error (uncomment if applicable)
            // await expect(adapter.getUserByUsername(testUsername))
            //     .rejects
            //     .toThrow(UserNotFoundError);

            expect(cognitoMock).toHaveReceivedCommandWith(AdminGetUserCommand, {
                 UserPoolId: mockConfig.userPoolId,
                 Username: testUsername,
             });
        });

        it('should handle generic errors during get user', async () => {
            const genericError = new Error('AWS Cognito Error');
            cognitoMock.on(AdminGetUserCommand).rejects(genericError);

            await expect(adapter.getUserByUsername(testUsername))
                .rejects
                .toThrow('AWS Cognito Error');
        });
    });

    // --- Test updateUserAttributes ---
    describe('updateUserAttributes', () => {
        const testUsername = 'test@example.com';
        const attributesToUpdate = [
            { name: 'given_name', value: 'Test' },
            { name: 'family_name', value: 'User' },
            { name: 'custom:tenantId', value: 'tenant-789' },
        ];
        const expectedCognitoAttributes = attributesToUpdate.map(attr => ({
            Name: attr.name,
            Value: attr.value,
        }));

        it('should update user attributes successfully', async () => {
            // AdminUpdateUserAttributes returns {} on success
            cognitoMock.on(AdminUpdateUserAttributesCommand).resolves({});

            await expect(adapter.updateUserAttributes(testUsername, attributesToUpdate))
                .resolves
                .toBeUndefined(); // Assuming it returns void on success

            expect(cognitoMock).toHaveReceivedCommandWith(AdminUpdateUserAttributesCommand, {
                UserPoolId: mockConfig.userPoolId,
                Username: testUsername,
                UserAttributes: expectedCognitoAttributes,
            });
        });

        it('should throw UserNotFoundError if user does not exist', async () => {
             const cognitoError = new UserNotFoundException({
                 message: 'User not found',
                 $metadata: {},
             });
             cognitoMock.on(AdminUpdateUserAttributesCommand).rejects(cognitoError);

             await expect(adapter.updateUserAttributes(testUsername, attributesToUpdate))
                 .rejects
                 // .toThrow(UserNotFoundError); // Example custom error
                 .toThrow(UserNotFoundException); // Or re-throws
         });

        it('should throw InvalidRequestError for invalid parameters', async () => {
            const cognitoError = new InvalidParameterException({
                message: 'Invalid attribute',
                $metadata: {},
            });
            cognitoMock.on(AdminUpdateUserAttributesCommand).rejects(cognitoError);

            await expect(adapter.updateUserAttributes(testUsername, [{ name: 'invalid-attr!', value: 'test'}]))
                .rejects
                // .toThrow(InvalidRequestError); // Example custom error
                .toThrow(InvalidParameterException); // Or re-throws
        });

        it('should handle generic errors during attribute update', async () => {
            const genericError = new Error('Update failed');
            cognitoMock.on(AdminUpdateUserAttributesCommand).rejects(genericError);

            await expect(adapter.updateUserAttributes(testUsername, attributesToUpdate))
                .rejects
                .toThrow('Update failed');
        });
    });

    // --- Test deleteUser ---
    describe('deleteUser', () => {
        const testUsername = 'user-to-delete@example.com';

        it('should delete user successfully', async () => {
            // AdminDeleteUser returns {} on success
            cognitoMock.on(AdminDeleteUserCommand).resolves({});

            await expect(adapter.deleteUser(testUsername))
                .resolves
                .toBeUndefined(); // Assuming it returns void on success

            expect(cognitoMock).toHaveReceivedCommandWith(AdminDeleteUserCommand, {
                UserPoolId: mockConfig.userPoolId,
                Username: testUsername,
            });
        });

        it('should handle UserNotFoundException gracefully (or throw)', async () => {
            // Depending on desired behavior, deleting a non-existent user might not be an error
            const cognitoError = new UserNotFoundException({
                message: 'User not found',
                $metadata: {},
            });
            cognitoMock.on(AdminDeleteUserCommand).rejects(cognitoError);

            // Option 1: Treat as success (idempotent)
            // await expect(adapter.deleteUser(testUsername)).resolves.toBeUndefined();

            // Option 2: Throw custom error
            // await expect(adapter.deleteUser(testUsername))
            //     .rejects
            //     .toThrow(UserNotFoundError);

            // Option 3: Re-throw original (shown here)
             await expect(adapter.deleteUser(testUsername))
                 .rejects
                 .toThrow(UserNotFoundException);

            expect(cognitoMock).toHaveReceivedCommandWith(AdminDeleteUserCommand, {
                 UserPoolId: mockConfig.userPoolId,
                 Username: testUsername,
             });
        });

        it('should handle generic errors during user deletion', async () => {
            const genericError = new Error('Deletion failed');
            cognitoMock.on(AdminDeleteUserCommand).rejects(genericError);

            await expect(adapter.deleteUser(testUsername))
                .rejects
                .toThrow('Deletion failed');
        });
    });

});
