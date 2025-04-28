import {
    AdminCreateUserCommand, AdminDeleteUserCommand, AdminGetUserCommand, AdminGetUserCommandOutput, // <-- Import Output type
    AdminUpdateUserAttributesCommand, CognitoIdentityProviderClient, InvalidParameterException, InvalidPasswordException,
    UsernameExistsException,
    UserNotFoundException,
    UserStatusType,
    UserType
} from '@aws-sdk/client-cognito-identity-provider';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest'; // Extends Jest expect
import { mock, MockProxy } from 'jest-mock-extended';
import { IConfigService } from '../../../../../src/application/interfaces/IConfigService';
import { ILogger } from '../../../../../src/application/interfaces/ILogger';
import { AdminCreateUserDetails, AdminUpdateUserAttributesDetails } from '../../../../../src/application/interfaces/IUserMgmtAdapter';
import { UserNotFoundError } from '../../../../../src/domain/exceptions/UserManagementError';
import { CognitoUserMgmtAdapter } from '../../../../../src/infrastructure/adapters/cognito/CognitoUserMgmtAdapter';
import { BaseError, ValidationError } from '../../../../../src/shared/errors/BaseError';


// --- Mocks ---
const cognitoMock = mockClient(CognitoIdentityProviderClient);

describe('CognitoUserMgmtAdapter', () => {
    let adapter: CognitoUserMgmtAdapter;
    let mockConfigService: MockProxy<IConfigService>;
    let mockLogger: MockProxy<ILogger>;

    const MOCK_REGION = 'us-east-1';
    const MOCK_USER_POOL_ID = 'us-east-1_testPoolId';

    beforeEach(() => {
        // Reset mocks before each test
        cognitoMock.reset();
        mockConfigService = mock<IConfigService>();
        mockLogger = mock<ILogger>();

        // Setup mock config
        mockConfigService.get.calledWith('AWS_REGION').mockReturnValue(MOCK_REGION);
        mockConfigService.get.calledWith('COGNITO_USER_POOL_ID').mockReturnValue(MOCK_USER_POOL_ID);

        // Instantiate the adapter with mocked dependencies
        // We pass the actual client constructor, but mockClient intercepts calls
        adapter = new CognitoUserMgmtAdapter(mockConfigService, mockLogger);
    });

    it('should be defined', () => {
        expect(adapter).toBeDefined();
    });

    // --- Test adminCreateUser ---
    describe('adminCreateUser', () => {
        const createDetails: AdminCreateUserDetails = {
            username: 'test@example.com',
            temporaryPassword: 'Password123!',
            userAttributes: {
                email: 'test@example.com',
                email_verified: 'true',
                'custom:tenantId': 'tenant-123',
            },
            forceAliasCreation: true,
            suppressWelcomeMessage: false,
        };
        const cognitoAttributes = [
            { Name: 'email', Value: 'test@example.com' },
            { Name: 'email_verified', Value: 'true' },
            { Name: 'custom:tenantId', Value: 'tenant-123' },
        ];

        it('should create a user successfully and return UserType', async () => {
            const mockCognitoResponse = {
                User: {
                    Username: 'cognito-uuid-123', // Cognito often returns sub as Username here
                    Attributes: cognitoAttributes,
                    UserCreateDate: new Date(),
                    UserLastModifiedDate: new Date(),
                    Enabled: true,
                    UserStatus: 'FORCE_CHANGE_PASSWORD',
                } as UserType,
            };
            cognitoMock.on(AdminCreateUserCommand).resolves(mockCognitoResponse);

            const result = await adapter.adminCreateUser(createDetails);

            // Check the returned UserType object
            expect(result).toBeDefined();
            expect(result).toEqual(mockCognitoResponse.User);
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Admin successfully created user'), expect.any(Object));

            // Verify the command was called correctly
            expect(cognitoMock).toHaveReceivedCommandWith(AdminCreateUserCommand, {
                UserPoolId: MOCK_USER_POOL_ID,
                Username: createDetails.username,
                TemporaryPassword: createDetails.temporaryPassword,
                UserAttributes: cognitoAttributes,
                MessageAction: undefined, // Because suppressWelcomeMessage is false
                ForceAliasCreation: createDetails.forceAliasCreation,
                DesiredDeliveryMediums: ['EMAIL'], // Derived from email attribute
            });
        });

        it('should throw ValidationError if username exists (mapped from UsernameExistsException)', async () => {
            const cognitoError = new UsernameExistsException({
                message: 'User already exists',
                $metadata: {},
            });
            cognitoMock.on(AdminCreateUserCommand).rejects(cognitoError);

            await expect(adapter.adminCreateUser(createDetails))
                .rejects
                .toThrow(ValidationError); // Expect mapped error
            await expect(adapter.adminCreateUser(createDetails))
                .rejects
                .toHaveProperty('message', expect.stringContaining('Username already exists'));
            expect(mockLogger.error).toHaveBeenCalled();
        });

        it('should throw ValidationError for invalid parameters (mapped from InvalidParameterException)', async () => {
            const cognitoError = new InvalidParameterException({
                message: 'Invalid parameter foo',
                $metadata: {},
            });
            cognitoMock.on(AdminCreateUserCommand).rejects(cognitoError);
            const invalidDetails = { ...createDetails, username: 'invalid username' };

            await expect(adapter.adminCreateUser(invalidDetails))
                .rejects
                .toThrow(ValidationError); // Expect mapped error
            await expect(adapter.adminCreateUser(invalidDetails))
                .rejects
                .toHaveProperty('message', expect.stringContaining('Invalid parameters. Invalid parameter foo'));
            expect(mockLogger.error).toHaveBeenCalled();
        });

         it('should throw ValidationError for invalid password (mapped from InvalidPasswordException)', async () => {
            const cognitoError = new InvalidPasswordException({
                message: 'Password does not meet requirements',
                $metadata: {},
            });
            cognitoMock.on(AdminCreateUserCommand).rejects(cognitoError);
            const invalidDetails = { ...createDetails, temporaryPassword: 'short' };

            await expect(adapter.adminCreateUser(invalidDetails))
                .rejects
                .toThrow(ValidationError); // Expect mapped error
             await expect(adapter.adminCreateUser(invalidDetails))
                .rejects
                .toHaveProperty('message', expect.stringContaining('Password does not meet requirements'));
            expect(mockLogger.error).toHaveBeenCalled();
        });

         it('should throw BaseError for generic errors during user creation', async () => {
            const genericError = new Error('Something went wrong');
            cognitoMock.on(AdminCreateUserCommand).rejects(genericError);

            await expect(adapter.adminCreateUser(createDetails))
                .rejects
                .toThrow(BaseError); // Expect mapped base error
            await expect(adapter.adminCreateUser(createDetails))
                .rejects
                .toHaveProperty('message', expect.stringContaining('adminCreateUser failed: Something went wrong'));
            expect(mockLogger.error).toHaveBeenCalled();
        });
    });

    // --- Test adminGetUser ---
    describe('adminGetUser', () => {
        const testUsername = 'test@example.com'; // Or a UUID if that's your username

        it('should return UserType data if user exists', async () => {
            // Explicitly type the mock response to match the command output
            const mockCognitoResponse: AdminGetUserCommandOutput = {
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
                UserStatus: UserStatusType.CONFIRMED,
                MFAOptions: [],
                $metadata: {}, // Add required $metadata property
            };
            cognitoMock.on(AdminGetUserCommand).resolves(mockCognitoResponse);

            const result = await adapter.adminGetUser(testUsername);

            // Check the returned UserType object (adapter extracts relevant fields)
            // The adapter's adminGetUser returns UserType | null, not the full CommandOutput
            expect(result).toBeDefined();
            expect(result?.Username).toEqual(testUsername);
            expect(result?.UserStatus).toEqual(UserStatusType.CONFIRMED);
            expect(result?.Attributes).toEqual(mockCognitoResponse.UserAttributes);
            expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Admin successfully retrieved user'), expect.any(Object));

            expect(cognitoMock).toHaveReceivedCommandWith(AdminGetUserCommand, {
                UserPoolId: MOCK_USER_POOL_ID,
                Username: testUsername,
            });
        });

        it('should return null if user does not exist (UserNotFoundException)', async () => {
            const cognitoError = new UserNotFoundException({
                message: 'User not found',
                $metadata: {},
            });
            cognitoMock.on(AdminGetUserCommand).rejects(cognitoError);

            const result = await adapter.adminGetUser(testUsername);
            expect(result).toBeNull(); // Adapter handles this specific error to return null
            expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('User not found'), expect.any(Object));

            expect(cognitoMock).toHaveReceivedCommandWith(AdminGetUserCommand, {
                 UserPoolId: MOCK_USER_POOL_ID,
                 Username: testUsername,
             });
        });

        it('should throw BaseError for generic errors during get user', async () => {
            const genericError = new Error('AWS Cognito Error');
            cognitoMock.on(AdminGetUserCommand).rejects(genericError);

            await expect(adapter.adminGetUser(testUsername))
                .rejects
                .toThrow(BaseError); // Expect mapped base error
            await expect(adapter.adminGetUser(testUsername))
                .rejects
                .toHaveProperty('message', expect.stringContaining('adminGetUser failed: AWS Cognito Error'));
            expect(mockLogger.error).toHaveBeenCalled();
        });
    });

    // --- Test adminUpdateUserAttributes ---
    describe('adminUpdateUserAttributes', () => {
        const updateDetails: AdminUpdateUserAttributesDetails = {
            username: 'test@example.com',
            attributesToUpdate: {
                given_name: 'Test',
                family_name: 'User',
                'custom:tenantId': 'tenant-789',
            },
        };
        const expectedCognitoAttributes = [
            { Name: 'given_name', Value: 'Test' },
            { Name: 'family_name', Value: 'User' },
            { Name: 'custom:tenantId', Value: 'tenant-789' },
        ];

        it('should update user attributes successfully (returns void)', async () => {
            // AdminUpdateUserAttributes returns {} on success
            cognitoMock.on(AdminUpdateUserAttributesCommand).resolves({});

            await expect(adapter.adminUpdateUserAttributes(updateDetails))
                .resolves
                .toBeUndefined(); // Expect void on success

            expect(cognitoMock).toHaveReceivedCommandWith(AdminUpdateUserAttributesCommand, {
                UserPoolId: MOCK_USER_POOL_ID,
                Username: updateDetails.username,
                UserAttributes: expectedCognitoAttributes,
            });
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Admin successfully updated attributes'), expect.any(Object));
        });

        it('should throw UserNotFoundError if user does not exist (mapped from UserNotFoundException)', async () => {
             const cognitoError = new UserNotFoundException({
                 message: 'User not found',
                 $metadata: {},
             });
             cognitoMock.on(AdminUpdateUserAttributesCommand).rejects(cognitoError);

             await expect(adapter.adminUpdateUserAttributes(updateDetails))
                 .rejects
                 .toThrow(UserNotFoundError); // Expect mapped error
             expect(mockLogger.error).toHaveBeenCalled();
         });

        it('should throw ValidationError for invalid parameters (mapped from InvalidParameterException)', async () => {
            const cognitoError = new InvalidParameterException({
                message: 'Invalid attribute xyz',
                $metadata: {},
            });
            cognitoMock.on(AdminUpdateUserAttributesCommand).rejects(cognitoError);
            const invalidDetails: AdminUpdateUserAttributesDetails = {
                username: updateDetails.username,
                attributesToUpdate: { 'invalid-attr!': 'test' },
            };

            await expect(adapter.adminUpdateUserAttributes(invalidDetails))
                .rejects
                .toThrow(ValidationError); // Expect mapped error
            await expect(adapter.adminUpdateUserAttributes(invalidDetails))
                .rejects
                .toHaveProperty('message', expect.stringContaining('Invalid parameters. Invalid attribute xyz'));
            expect(mockLogger.error).toHaveBeenCalled();
        });

        it('should throw BaseError for generic errors during attribute update', async () => {
            const genericError = new Error('Update failed');
            cognitoMock.on(AdminUpdateUserAttributesCommand).rejects(genericError);

            await expect(adapter.adminUpdateUserAttributes(updateDetails))
                .rejects
                .toThrow(BaseError); // Expect mapped base error
            await expect(adapter.adminUpdateUserAttributes(updateDetails))
                .rejects
                .toHaveProperty('message', expect.stringContaining('adminUpdateUserAttributes failed: Update failed'));
            expect(mockLogger.error).toHaveBeenCalled();
        });
    });

    // --- Test adminDeleteUser ---
    describe('adminDeleteUser', () => {
        const testUsername = 'user-to-delete@example.com';

        it('should delete user successfully (returns void)', async () => {
            // AdminDeleteUser returns {} on success
            cognitoMock.on(AdminDeleteUserCommand).resolves({});

            await expect(adapter.adminDeleteUser(testUsername))
                .resolves
                .toBeUndefined(); // Expect void on success

            expect(cognitoMock).toHaveReceivedCommandWith(AdminDeleteUserCommand, {
                UserPoolId: MOCK_USER_POOL_ID,
                Username: testUsername,
            });
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Admin successfully deleted user'), expect.any(Object));
        });

        it('should throw UserNotFoundError if user does not exist (mapped from UserNotFoundException)', async () => {
            const cognitoError = new UserNotFoundException({
                message: 'User not found',
                $metadata: {},
            });
            cognitoMock.on(AdminDeleteUserCommand).rejects(cognitoError);

             await expect(adapter.adminDeleteUser(testUsername))
                 .rejects
                 .toThrow(UserNotFoundError); // Expect mapped error

            expect(cognitoMock).toHaveReceivedCommandWith(AdminDeleteUserCommand, {
                 UserPoolId: MOCK_USER_POOL_ID,
                 Username: testUsername,
             });
             expect(mockLogger.error).toHaveBeenCalled();
        });

        it('should throw BaseError for generic errors during user deletion', async () => {
            const genericError = new Error('Deletion failed');
            cognitoMock.on(AdminDeleteUserCommand).rejects(genericError);

            await expect(adapter.adminDeleteUser(testUsername))
                .rejects
                .toThrow(BaseError); // Expect mapped base error
            await expect(adapter.adminDeleteUser(testUsername))
                .rejects
                .toHaveProperty('message', expect.stringContaining('adminDeleteUser failed: Deletion failed'));
            expect(mockLogger.error).toHaveBeenCalled();
        });
    });

    // TODO: Add tests for other adapter methods:
    // - adminDisableUser
    // - adminEnableUser
    // - adminInitiatePasswordReset
    // - adminSetUserPassword
    // - adminAddUserToGroup
    // - adminRemoveUserFromGroup
    // - adminListGroupsForUser
    // - adminListUsers
    // - adminListUsersInGroup
    // - adminCreateGroup
    // - adminDeleteGroup
    // - adminGetGroup
    // - adminListGroups
});
