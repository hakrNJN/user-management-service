// tests/unit/infrastructure/adapters/cognito/CognitoUserMgmtAdapter.spec.ts
import {
    AdminAddUserToGroupCommand,
    AdminCreateUserCommand, AdminDeleteUserCommand, AdminDisableUserCommand, AdminEnableUserCommand, AdminGetUserCommand, AdminGetUserCommandOutput, AdminListGroupsForUserCommand, AdminRemoveUserFromGroupCommand, AdminResetUserPasswordCommand, AdminSetUserPasswordCommand, // <-- Import Output type
    AdminUpdateUserAttributesCommand, CognitoIdentityProviderClient, CreateGroupCommand, DeleteGroupCommand, GetGroupCommand, GroupExistsException, InvalidParameterException, InvalidPasswordException,
    ListGroupsCommand,
    ListUsersCommand,
    ListUsersInGroupCommand,
    ResourceNotFoundException,
    UsernameExistsException,
    UserNotFoundException,
    UserStatusType,
    UserType
} from '@aws-sdk/client-cognito-identity-provider';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest'; // Extends Jest expect
import 'reflect-metadata';
import { IConfigService } from '../../../../../src/application/interfaces/IConfigService';
import { ILogger } from '../../../../../src/application/interfaces/ILogger';
import { AdminCreateUserDetails, AdminUpdateUserAttributesDetails, CreateGroupDetails, ListUsersOptions } from '../../../../../src/application/interfaces/IUserMgmtAdapter';
import { GroupExistsError, UserNotFoundError } from '../../../../../src/domain/exceptions/UserManagementError';
import { CognitoUserMgmtAdapter } from '../../../../../src/infrastructure/adapters/cognito/CognitoUserMgmtAdapter';
import { BaseError, NotFoundError, ValidationError } from '../../../../../src/shared/errors/BaseError';
import { mockConfigService } from '../../../../mocks/config.mock';
import { mockLogger } from '../../../../mocks/logger.mock';


// --- Mocks ---
const cognitoMock = mockClient(CognitoIdentityProviderClient);

const MOCK_USER_POOL_ID = 'us-east-1_testPoolId'; // Consistent Pool ID for tests
const MOCK_AWS_REGION = 'us-east-1';

describe('CognitoUserMgmtAdapter', () => {
    let adapter: CognitoUserMgmtAdapter;
    let configService: jest.Mocked<IConfigService>;
    let logger: jest.Mocked<ILogger>;

    beforeEach(() => {
        cognitoMock.reset();
        jest.clearAllMocks();

        // Use fresh mocks
        configService = { ...mockConfigService } as jest.Mocked<IConfigService>;
        logger = { ...mockLogger } as jest.Mocked<ILogger>;

        // --- FIX: Configure mockConfigService for THIS test suite ---
        // Ensure getOrThrow returns the necessary values for constructor
        configService.getOrThrow.mockImplementation((key: string): string => {
            if (key === 'AWS_REGION') return MOCK_AWS_REGION;
            if (key === 'COGNITO_USER_POOL_ID') return MOCK_USER_POOL_ID;
            throw new Error(`MockConfigService: Missing mock for required key "${key}"`);
        });
        // If adapter constructor *also* uses .get(), mock that too if necessary
        configService.get.mockImplementation((key: string, defaultValue?: any): any => {
            if (key === 'AWS_REGION') return MOCK_AWS_REGION; // For consistency if get is used elsewhere
            // If get is used for non-essential config, provide defaults or return defaultValue
            return defaultValue;
        });
        // --- End Fix ---


        // Instantiate the actual adapter with the mocked dependencies
        adapter = new CognitoUserMgmtAdapter(configService, logger);
    });

    it('should initialize correctly', () => {
        expect(adapter).toBeDefined();
        expect(configService.getOrThrow).toHaveBeenCalledWith('AWS_REGION');
        expect(configService.getOrThrow).toHaveBeenCalledWith('COGNITO_USER_POOL_ID');
        expect(logger.info).toHaveBeenCalledWith('CognitoUserMgmtAdapter initialized', expect.any(Object));
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
            expect(logger.info).toHaveBeenCalledWith(
                expect.stringContaining(`Admin successfully created user: ${createDetails.username}`)// Be less strict about the metadata object structure for now
            );
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
            expect(logger.error).toHaveBeenCalled();
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
            expect(logger.error).toHaveBeenCalled();
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
            expect(logger.error).toHaveBeenCalled();
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
            expect(logger.error).toHaveBeenCalled();
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
            expect(logger.debug).toHaveBeenCalledWith(
                expect.stringContaining(`Admin successfully retrieved user: ${testUsername}`));

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
            expect(logger.debug).toHaveBeenCalledWith(
                `adminGetUser - User not found: ${testUsername}`, // More specific matcmetadata is logged, otherwise remove
            );

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
            expect(logger.error).toHaveBeenCalled();
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
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Admin successfully updated attributes'));
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
            expect(logger.error).toHaveBeenCalled();
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
            expect(logger.error).toHaveBeenCalled();
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
            expect(logger.error).toHaveBeenCalled();
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
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Admin successfully deleted user'));
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
            expect(logger.error).toHaveBeenCalled();
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
            expect(logger.error).toHaveBeenCalled();
        });
    });

    // --- Test adminDisableUser ---
    describe('adminDisableUser', () => {
        const testUsername = 'user-to-disable@test.co';

        it('should disable user successfully (returns void)', async () => {
            cognitoMock.on(AdminDisableUserCommand).resolves({});

            const result = await adapter.adminDisableUser(testUsername);

            expect(result).toBeUndefined();
            expect(cognitoMock).toHaveReceivedCommandWith(AdminDisableUserCommand, {
                UserPoolId: MOCK_USER_POOL_ID,
                Username: testUsername,
            });
            expect(logger.info).toHaveBeenCalledWith(
                `Admin successfully disabled user: ${testUsername}`
            );
        });

        it('should throw UserNotFoundError if user not found', async () => {
            const error = new UserNotFoundException({ message: "User not found.", $metadata: {} });
            cognitoMock.on(AdminDisableUserCommand).rejects(error);

            await expect(adapter.adminDisableUser(testUsername))
                .rejects.toThrow(UserNotFoundError);
            expect(cognitoMock).toHaveReceivedCommandWith(AdminDisableUserCommand, { Username: testUsername });
        });

        // Add test for other generic errors -> BaseError
    });

    // --- Test adminEnableUser ---
    describe('adminEnableUser', () => {
        const testUsername = 'user-to-enable@test.co';

        it('should enable user successfully (returns void)', async () => {
            cognitoMock.on(AdminEnableUserCommand).resolves({});

            const result = await adapter.adminEnableUser(testUsername);

            expect(result).toBeUndefined();
            expect(cognitoMock).toHaveReceivedCommandWith(AdminEnableUserCommand, {
                UserPoolId: MOCK_USER_POOL_ID,
                Username: testUsername,
            });
            expect(logger.info).toHaveBeenCalledWith(
                `Admin successfully enabled user: ${testUsername}`
            );
        });

        it('should throw UserNotFoundError if user not found', async () => {
            const error = new UserNotFoundException({ message: "User not found.", $metadata: {} });
            cognitoMock.on(AdminEnableUserCommand).rejects(error);

            await expect(adapter.adminEnableUser(testUsername))
                .rejects.toThrow(UserNotFoundError);
        });
        // Add test for other generic errors -> BaseError
    });

    // --- Test adminInitiatePasswordReset ---
    describe('adminInitiatePasswordReset', () => {
        const testUsername = 'user-reset-pass@test.co';

        it('should initiate password reset successfully (returns void)', async () => {
            cognitoMock.on(AdminResetUserPasswordCommand).resolves({});

            const result = await adapter.adminInitiatePasswordReset(testUsername);

            expect(result).toBeUndefined();
            expect(cognitoMock).toHaveReceivedCommandWith(AdminResetUserPasswordCommand, {
                UserPoolId: MOCK_USER_POOL_ID,
                Username: testUsername,
            });
            expect(logger.info).toHaveBeenCalledWith(
                `Admin successfully initiated password reset for user: ${testUsername}`
            );
        });

        it('should throw UserNotFoundError if user not found', async () => {
            const error = new UserNotFoundException({ message: "User not found.", $metadata: {} });
            cognitoMock.on(AdminResetUserPasswordCommand).rejects(error);

            await expect(adapter.adminInitiatePasswordReset(testUsername))
                .rejects.toThrow(UserNotFoundError);
        });
        // Add test for other generic errors -> BaseError
    });

    // --- Test adminSetUserPassword ---
    describe('adminSetUserPassword', () => {
        const testUsername = 'user-set-pass@test.co';
        const password = 'NewPassword123!';

        it('should set user password successfully (permanent=true)', async () => {
            cognitoMock.on(AdminSetUserPasswordCommand).resolves({});

            const result = await adapter.adminSetUserPassword(testUsername, password, true);

            expect(result).toBeUndefined();
            expect(cognitoMock).toHaveReceivedCommandWith(AdminSetUserPasswordCommand, {
                UserPoolId: MOCK_USER_POOL_ID,
                Username: testUsername,
                Password: password,
                Permanent: true,
            });
            expect(logger.info).toHaveBeenCalledWith(
                `Admin successfully set password for user: ${testUsername}`
            );
        });

        it('should set user password successfully (permanent=false)', async () => {
            cognitoMock.on(AdminSetUserPasswordCommand).resolves({});
            await adapter.adminSetUserPassword(testUsername, password, false);
            expect(cognitoMock).toHaveReceivedCommandWith(AdminSetUserPasswordCommand, { Permanent: false });
        });

        it('should throw UserNotFoundError if user not found', async () => {
            const error = new UserNotFoundException({ message: "User not found.", $metadata: {} });
            cognitoMock.on(AdminSetUserPasswordCommand).rejects(error);
            await expect(adapter.adminSetUserPassword(testUsername, password, true))
                .rejects.toThrow(UserNotFoundError);
        });

        it('should throw ValidationError for InvalidPasswordException', async () => {
            // Mock the specific error message from Cognito
            const cognitoErrorMessage = "Password does not conform.";
            const error = new InvalidPasswordException({ message: cognitoErrorMessage, $metadata: {} });
            cognitoMock.on(AdminSetUserPasswordCommand).rejects(error);

            // Check it throws the correct mapped error type
            await expect(adapter.adminSetUserPassword(testUsername, 'bad', true))
                .rejects.toThrow(ValidationError);

            // FIX: Check the actual generated message, which includes the operation and the Cognito message
            await expect(adapter.adminSetUserPassword(testUsername, 'bad', true))
                .rejects.toThrow(`Operation: adminSetUserPassword. ${cognitoErrorMessage}`);
            // You could also use a regex that matches the important part:
            // .rejects.toThrow(/Password does not conform/);
        });

        it('should throw ValidationError for InvalidParameterException', async () => {
            const error = new InvalidParameterException({ message: "Invalid parameter.", $metadata: {} });
            cognitoMock.on(AdminSetUserPasswordCommand).rejects(error);
            await expect(adapter.adminSetUserPassword(testUsername, password, true))
                .rejects.toThrow(ValidationError);
            await expect(adapter.adminSetUserPassword(testUsername, password, true))
                .rejects.toThrow(/Invalid parameters/);
        });
        // Add test for other generic errors -> BaseError
    });

    // --- Test adminAddUserToGroup ---
    describe('adminAddUserToGroup', () => {
        const testUsername = 'user-add-grp@test.co';
        const testGroupName = 'group-editors';

        it('should add user to group successfully (returns void)', async () => {
            cognitoMock.on(AdminAddUserToGroupCommand).resolves({});

            const result = await adapter.adminAddUserToGroup(testUsername, testGroupName);

            expect(result).toBeUndefined();
            expect(cognitoMock).toHaveReceivedCommandWith(AdminAddUserToGroupCommand, {
                UserPoolId: MOCK_USER_POOL_ID,
                Username: testUsername,
                GroupName: testGroupName,
            });
            expect(logger.info).toHaveBeenCalledWith(
                `Admin successfully added user ${testUsername} to group ${testGroupName}`
            );
        });

        it('should throw UserNotFoundError if user not found', async () => {
            const error = new UserNotFoundException({ message: "User not found.", $metadata: {} });
            cognitoMock.on(AdminAddUserToGroupCommand).rejects(error);
            await expect(adapter.adminAddUserToGroup(testUsername, testGroupName))
                .rejects.toThrow(UserNotFoundError);
        });

        it('should throw NotFoundError if group not found (ResourceNotFoundException)', async () => {
            const error = new ResourceNotFoundException({ message: "Group not found.", $metadata: {} });
            cognitoMock.on(AdminAddUserToGroupCommand).rejects(error);
            await expect(adapter.adminAddUserToGroup(testUsername, testGroupName))
                .rejects.toThrow(NotFoundError); // Mapped to generic NotFoundError
            await expect(adapter.adminAddUserToGroup(testUsername, testGroupName))
                .rejects.toThrow(/Resource \(User or Group\)/);
        });

        // Note: Cognito doesn't have a standard UserAlreadyInGroupException.
        // This logic is usually handled in the Service layer by checking first,
        // or by catching a generic error if the add fails due to existing membership.
        // Test generic error case:
        it('should throw BaseError for other errors', async () => {
            const error = new Error("Some other cognito issue");
            cognitoMock.on(AdminAddUserToGroupCommand).rejects(error);
            await expect(adapter.adminAddUserToGroup(testUsername, testGroupName))
                .rejects.toThrow(BaseError);
        });
    });

    // --- Test adminRemoveUserFromGroup ---
    describe('adminRemoveUserFromGroup', () => {
        const testUsername = 'user-rem-grp@test.co';
        const testGroupName = 'group-editors';

        it('should remove user from group successfully (returns void)', async () => {
            cognitoMock.on(AdminRemoveUserFromGroupCommand).resolves({});

            const result = await adapter.adminRemoveUserFromGroup(testUsername, testGroupName);

            expect(result).toBeUndefined();
            expect(cognitoMock).toHaveReceivedCommandWith(AdminRemoveUserFromGroupCommand, {
                UserPoolId: MOCK_USER_POOL_ID,
                Username: testUsername,
                GroupName: testGroupName,
            });
            expect(logger.info).toHaveBeenCalledWith(
                `Admin successfully removed user ${testUsername} from group ${testGroupName}`
            );
        });

        it('should throw UserNotFoundError if user not found', async () => {
            const error = new UserNotFoundException({ message: "User not found.", $metadata: {} });
            cognitoMock.on(AdminRemoveUserFromGroupCommand).rejects(error);
            await expect(adapter.adminRemoveUserFromGroup(testUsername, testGroupName))
                .rejects.toThrow(UserNotFoundError);
        });

        it('should throw NotFoundError if group not found', async () => {
            const error = new ResourceNotFoundException({ message: "Group not found.", $metadata: {} });
            cognitoMock.on(AdminRemoveUserFromGroupCommand).rejects(error);
            await expect(adapter.adminRemoveUserFromGroup(testUsername, testGroupName))
                .rejects.toThrow(NotFoundError);
        });
        // Add generic BaseError test
    });

    // --- Test adminListGroupsForUser ---
    describe('adminListGroupsForUser', () => {
        const testUsername = 'user-list-grps@test.co';
        const mockResponse = {
            Groups: [
                { GroupName: 'group1', Description: 'Desc1', Precedence: 1 },
                { GroupName: 'group2', Description: 'Desc2', Precedence: 2 },
            ],
            NextToken: 'nextPageToken123',
        };

        it('should list groups for a user successfully', async () => {
            cognitoMock.on(AdminListGroupsForUserCommand).resolves(mockResponse);

            const result = await adapter.adminListGroupsForUser(testUsername, 10, 'startToken');

            expect(result.groups).toHaveLength(2);
            expect(result.groups[0].GroupName).toBe('group1');
            expect(result.nextToken).toBe('nextPageToken123');
            expect(cognitoMock).toHaveReceivedCommandWith(AdminListGroupsForUserCommand, {
                UserPoolId: MOCK_USER_POOL_ID,
                Username: testUsername,
                Limit: 10,
                NextToken: 'startToken',
            });
            expect(logger.debug).toHaveBeenCalledWith(
                `Admin successfully listed groups for user ${testUsername}`
            );
        });

        it('should handle empty group list', async () => {
            cognitoMock.on(AdminListGroupsForUserCommand).resolves({ Groups: [], NextToken: undefined });
            const result = await adapter.adminListGroupsForUser(testUsername);
            expect(result.groups).toHaveLength(0);
            expect(result.nextToken).toBeUndefined();
        });

        it('should throw UserNotFoundError if user not found', async () => {
            const error = new UserNotFoundException({ message: "User not found.", $metadata: {} });
            cognitoMock.on(AdminListGroupsForUserCommand).rejects(error);
            await expect(adapter.adminListGroupsForUser(testUsername))
                .rejects.toThrow(UserNotFoundError);
        });
        // Add generic BaseError test
    });

    // --- Test adminListUsers ---
    describe('adminListUsers', () => {
        const options: ListUsersOptions = { limit: 25, paginationToken: 'token1', filter: 'email ^= "test@"' };
        const mockResponse = {
            Users: [
                { Username: 'user1', Attributes: [{ Name: 'email', Value: 'test@1' }] },
                { Username: 'user2', Attributes: [{ Name: 'email', Value: 'test@2' }] },
            ],
            PaginationToken: 'token2',
        };

        it('should list users successfully', async () => {
            cognitoMock.on(ListUsersCommand).resolves(mockResponse);

            const result = await adapter.adminListUsers(options);

            expect(result.users).toHaveLength(2);
            expect(result.users[0].Username).toBe('user1');
            expect(result.paginationToken).toBe('token2');
            expect(cognitoMock).toHaveReceivedCommandWith(ListUsersCommand, {
                UserPoolId: MOCK_USER_POOL_ID,
                Limit: options.limit,
                PaginationToken: options.paginationToken,
                Filter: options.filter,
            });
            expect(logger.debug).toHaveBeenCalledWith(`Admin successfully listed users`);
        });

        it('should handle empty user list', async () => {
            cognitoMock.on(ListUsersCommand).resolves({ Users: [], PaginationToken: undefined });
            const result = await adapter.adminListUsers({});
            expect(result.users).toHaveLength(0);
            expect(result.paginationToken).toBeUndefined();
        });

        it('should throw BaseError for InvalidParameterException (e.g., bad filter)', async () => {
            const error = new InvalidParameterException({ message: "Invalid filter.", $metadata: {} });
            cognitoMock.on(ListUsersCommand).rejects(error);
            await expect(adapter.adminListUsers(options))
                .rejects.toThrow(ValidationError); // Mapped to ValidationError
            await expect(adapter.adminListUsers(options))
                .rejects.toThrow(/Invalid parameters/);
        });
        // Add generic BaseError test
    });

    // --- Test adminListUsersInGroup ---
    describe('adminListUsersInGroup', () => {
        const testGroupName = 'group-list-users';
        const mockResponse = {
            Users: [
                { Username: 'userA', Attributes: [] },
                { Username: 'userB', Attributes: [] },
            ],
            NextToken: 'nextGroupToken',
        };

        it('should list users in a group successfully', async () => {
            cognitoMock.on(ListUsersInGroupCommand).resolves(mockResponse);

            const result = await adapter.adminListUsersInGroup(testGroupName, 5, 'startGroupToken');

            expect(result.users).toHaveLength(2);
            expect(result.users[0].Username).toBe('userA');
            expect(result.nextToken).toBe('nextGroupToken');
            expect(cognitoMock).toHaveReceivedCommandWith(ListUsersInGroupCommand, {
                UserPoolId: MOCK_USER_POOL_ID,
                GroupName: testGroupName,
                Limit: 5,
                NextToken: 'startGroupToken',
            });
            expect(logger.debug).toHaveBeenCalledWith(`Admin successfully listed users in group ${testGroupName}`);
        });

        it('should throw NotFoundError if group not found', async () => {
            const error = new ResourceNotFoundException({ message: "Group not found.", $metadata: {} });
            cognitoMock.on(ListUsersInGroupCommand).rejects(error);
            await expect(adapter.adminListUsersInGroup(testGroupName))
                .rejects.toThrow(NotFoundError);
        });
        // Add empty list test
        // Add generic BaseError test
    });

    // --- Test adminCreateGroup ---
    describe('adminCreateGroup', () => {
        const details: CreateGroupDetails = { groupName: 'new-group-test', description: 'A test group' };
        const mockResponse = {
            Group: { GroupName: details.groupName, Description: details.description, UserPoolId: MOCK_USER_POOL_ID }
        };

        it('should create group successfully', async () => {
            cognitoMock.on(CreateGroupCommand).resolves(mockResponse);

            const result = await adapter.adminCreateGroup(details);

            expect(result).toEqual(mockResponse.Group);
            expect(cognitoMock).toHaveReceivedCommandWith(CreateGroupCommand, {
                UserPoolId: MOCK_USER_POOL_ID,
                GroupName: details.groupName,
                Description: details.description,
                Precedence: undefined, // Assuming not provided
            });
            expect(logger.info).toHaveBeenCalledWith(`Admin successfully created group: ${details.groupName}`);
        });

        it('should throw GroupExistsError if group already exists', async () => {
            const error = new GroupExistsException({ message: "Group exists.", $metadata: {} });
            cognitoMock.on(CreateGroupCommand).rejects(error);
            await expect(adapter.adminCreateGroup(details))
                .rejects.toThrow(GroupExistsError);
        });
        // Add generic BaseError test
    });

    // --- Test adminDeleteGroup ---
    describe('adminDeleteGroup', () => {
        const testGroupName = 'group-to-delete';

        it('should delete group successfully (returns void)', async () => {
            cognitoMock.on(DeleteGroupCommand).resolves({});

            const result = await adapter.adminDeleteGroup(testGroupName);

            expect(result).toBeUndefined();
            expect(cognitoMock).toHaveReceivedCommandWith(DeleteGroupCommand, {
                UserPoolId: MOCK_USER_POOL_ID,
                GroupName: testGroupName,
            });
            expect(logger.info).toHaveBeenCalledWith(`Admin successfully deleted group: ${testGroupName}`);
        });

        it('should throw NotFoundError if group not found', async () => {
            const error = new ResourceNotFoundException({ message: "Group not found.", $metadata: {} });
            cognitoMock.on(DeleteGroupCommand).rejects(error);
            await expect(adapter.adminDeleteGroup(testGroupName))
                .rejects.toThrow(NotFoundError);
        });
        // Add generic BaseError test
    });

    // --- Test adminGetGroup ---
    describe('adminGetGroup', () => {
        const testGroupName = 'group-to-get';
        const mockResponse = {
            Group: { GroupName: testGroupName, Description: 'Details', UserPoolId: MOCK_USER_POOL_ID }
        };

        it('should get group successfully', async () => {
            cognitoMock.on(GetGroupCommand).resolves(mockResponse);

            const result = await adapter.adminGetGroup(testGroupName);

            expect(result).toEqual(mockResponse.Group);
            expect(cognitoMock).toHaveReceivedCommandWith(GetGroupCommand, {
                UserPoolId: MOCK_USER_POOL_ID,
                GroupName: testGroupName,
            });
            expect(logger.debug).toHaveBeenCalledWith(`Admin successfully retrieved group: ${testGroupName}`);
        });

        it('should return null if group not found', async () => {
            const error = new ResourceNotFoundException({ message: "Group not found.", $metadata: {} });
            cognitoMock.on(GetGroupCommand).rejects(error);
            const result = await adapter.adminGetGroup(testGroupName);
            expect(result).toBeNull();
            expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining(`Group not found: ${testGroupName}`));
        });
        // Add generic BaseError test
    });

    // --- Test adminListGroups ---
    describe('adminListGroups', () => {
        const mockResponse = {
            Groups: [
                { GroupName: 'grp1', Description: 'G1' },
                { GroupName: 'grp2', Description: 'G2' },
            ],
            NextToken: 'listGroupsToken',
        };

        it('should list groups successfully', async () => {
            cognitoMock.on(ListGroupsCommand).resolves(mockResponse);

            const result = await adapter.adminListGroups(15, 'startToken');

            expect(result.groups).toHaveLength(2);
            expect(result.groups[0].GroupName).toBe('grp1');
            expect(result.nextToken).toBe('listGroupsToken');
            expect(cognitoMock).toHaveReceivedCommandWith(ListGroupsCommand, {
                UserPoolId: MOCK_USER_POOL_ID,
                Limit: 15,
                NextToken: 'startToken',
            });
            expect(logger.debug).toHaveBeenCalledWith(`Admin successfully listed groups`);
        });
        // Add empty list test
        // Add generic BaseError test
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
