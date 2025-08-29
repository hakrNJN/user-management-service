import {
    AdminAddUserToGroupCommand,
    AdminCreateUserCommand,
    AdminDeleteUserCommand, // Added
    AdminDisableUserCommand,
    AdminEnableUserCommand,
    AdminGetUserCommand,
    AdminGetUserCommandOutput,
    AdminListGroupsForUserCommand,
    AdminRemoveUserFromGroupCommand,
    AdminResetUserPasswordCommand,
    AdminSetUserPasswordCommand,
    AdminUpdateUserAttributesCommand,
    CognitoIdentityProviderClient,
    CreateGroupCommand,
    GetGroupCommand,
    GroupExistsException,
    GroupType,
    InternalErrorException,
    InvalidParameterException,
    InvalidPasswordException,
    LimitExceededException, // Added
    ListGroupsCommand,
    ListUsersCommand,
    ListUsersInGroupCommand,
    NotAuthorizedException,
    ResourceNotFoundException,
    TooManyRequestsException,
    UpdateGroupCommand,
    UsernameExistsException,
    UserNotFoundException,
    UserType
} from "@aws-sdk/client-cognito-identity-provider";
import { mock, MockProxy } from 'jest-mock-extended';
import 'reflect-metadata';
import { IConfigService } from '../../../../../src/application/interfaces/IConfigService';
import { ILogger } from '../../../../../src/application/interfaces/ILogger';
import { GroupExistsError, UserNotFoundError } from '../../../../../src/domain/exceptions/UserManagementError';
import { CognitoUserMgmtAdapter } from '../../../../../src/infrastructure/adapters/cognito/CognitoUserMgmtAdapter';
import { applyCircuitBreaker } from '../../../../../src/infrastructure/resilience/applyResilience';
import { BaseError, NotFoundError, ValidationError } from '../../../../../src/shared/errors/BaseError';



// Mock the AWS SDK CognitoIdentityProviderClient
jest.mock("@aws-sdk/client-cognito-identity-provider", () => {
    const actualModule = jest.requireActual('@aws-sdk/client-cognito-identity-provider');
    return {
        ...actualModule,
        CognitoIdentityProviderClient: jest.fn().mockImplementation(() => ({
            send: jest.fn(),
        })),
        AdminCreateUserCommand: jest.fn(),
        AdminGetUserCommand: jest.fn(),
        AdminUpdateUserAttributesCommand: jest.fn(),
        AdminDeleteUserCommand: jest.fn(),
        AdminDisableUserCommand: jest.fn(),
        AdminEnableUserCommand: jest.fn(),
        AdminResetUserPasswordCommand: jest.fn(),
        AdminSetUserPasswordCommand: jest.fn(),
        AdminAddUserToGroupCommand: jest.fn(),
        AdminRemoveUserFromGroupCommand: jest.fn(),
        AdminListGroupsForUserCommand: jest.fn(),
        ListUsersCommand: jest.fn(),
        ListUsersInGroupCommand: jest.fn(),
        CreateGroupCommand: jest.fn(),
        UpdateGroupCommand: jest.fn(),
        GetGroupCommand: jest.fn(),
        ListGroupsCommand: jest.fn(),
        // Exceptions
        UserNotFoundException: actualModule.UserNotFoundException,
        GroupExistsException: actualModule.GroupExistsException,
        UsernameExistsException: actualModule.UsernameExistsException,
        InvalidPasswordException: actualModule.InvalidPasswordException,
        InvalidParameterException: actualModule.InvalidParameterException,
        LimitExceededException: actualModule.LimitExceededException,
        TooManyRequestsException: actualModule.TooManyRequestsException,
        NotAuthorizedException: actualModule.NotAuthorizedException,
        InternalErrorException: actualModule.InternalErrorException,
        ResourceNotFoundException: actualModule.ResourceNotFoundException,
    };
});

// Mock the applyCircuitBreaker function
jest.mock('../../../../../src/infrastructure/resilience/applyResilience', () => ({
    applyCircuitBreaker: jest.fn((fn) => fn), // By default, just return the function itself
}));

describe('CognitoUserMgmtAdapter', () => {
    let configServiceMock: MockProxy<IConfigService>;
    let loggerMock: MockProxy<ILogger>;
    let adapter: CognitoUserMgmtAdapter;
    let cognitoClientMock: MockProxy<CognitoIdentityProviderClient>;

    const userPoolId = 'test-user-pool-id';
    const region = 'us-east-1';

    beforeEach(() => {
        configServiceMock = mock<IConfigService>();
        loggerMock = mock<ILogger>();

        // Setup config service mocks
        configServiceMock.getOrThrow.mockImplementation(<T = string>(key: string): T => {
            if (key === 'AWS_REGION') return region as T;
            if (key === 'COGNITO_USER_POOL_ID') return userPoolId as T;
            throw new Error(`Missing config: ${key}`);
        });
        configServiceMock.get.mockImplementation(<T = string>(key: string, defaultValue?: T): T | undefined => {
            if (key === 'DYNAMODB_ENDPOINT_URL') return undefined as T;
            return defaultValue;
        });

        // Mock AWS SDK commands
        const mockSend = jest.fn().mockImplementation((command) => {
            if (command instanceof AdminCreateUserCommand) {
                return Promise.resolve({
                    User: {
                        Username: 'testuser',
                        Attributes: [{ Name: 'email', Value: 'test@example.com' }],
                        UserCreateDate: new Date(),
                        UserStatus: 'FORCE_CHANGE_PASSWORD'
                    },
                    $metadata: {}
                });
            }
            if (command instanceof AdminGetUserCommand) {
                return Promise.resolve({
                    Username: 'testuser',
                    UserAttributes: [{ Name: 'email', Value: 'test@example.com' }],
                    Enabled: true,
                    UserStatus: 'CONFIRMED',
                    $metadata: {}
                });
            }
            if (command instanceof AdminListGroupsForUserCommand) {
                return Promise.resolve({
                    Groups: [{ GroupName: 'group1' }, { GroupName: 'group2' }],
                    NextToken: 'token',
                    $metadata: {}
                });
            }
            if (command instanceof ListUsersCommand) {
                return Promise.resolve({
                    Users: [
                        { Username: 'user1', UserStatus: 'CONFIRMED' },
                        { Username: 'user2', UserStatus: 'UNCONFIRMED' }
                    ],
                    PaginationToken: 'token',
                    $metadata: {}
                });
            }
            if (command instanceof ListUsersInGroupCommand) {
                return Promise.resolve({
                    Users: [{ Username: 'user1' }, { Username: 'user2' }],
                    NextToken: 'token',
                    $metadata: {}
                });
            }
            if (command instanceof CreateGroupCommand) {
                return Promise.resolve({
                    Group: {
                        GroupName: 'testgroup',
                        Description: JSON.stringify({ description: 'Test description', status: 'ACTIVE' }),
                        Precedence: 1
                    },
                    $metadata: {}
                });
            }
            if (command instanceof GetGroupCommand) {
                return Promise.resolve({
                    Group: {
                        GroupName: 'testgroup',
                        Description: JSON.stringify({ description: 'Test description', status: 'ACTIVE' }),
                        Precedence: 1
                    },
                    $metadata: {}
                });
            }
            if (command instanceof ListGroupsCommand) {
                return Promise.resolve({
                    Groups: [
                        {
                            GroupName: 'group1',
                            Description: JSON.stringify({ description: 'desc1', status: 'ACTIVE' })
                        },
                        {
                            GroupName: 'group2',
                            Description: JSON.stringify({ description: 'desc2', status: 'ACTIVE' })
                        }
                    ],
                    NextToken: 'token',
                    $metadata: {}
                });
            }
            // Default empty response for void operations
            return Promise.resolve({ $metadata: {} });
        });

        cognitoClientMock = {
            send: mockSend
        } as any;

        (CognitoIdentityProviderClient as jest.Mock).mockImplementation(() => cognitoClientMock);

        adapter = new CognitoUserMgmtAdapter(configServiceMock, loggerMock);

        // Ensure applyCircuitBreaker returns the original function for most tests
        (applyCircuitBreaker as jest.Mock).mockImplementation((fn) => fn);
    });

    // --- Constructor Tests ---
    describe('constructor', () => {
        it('should initialize CognitoIdentityProviderClient with correct region and userPoolId', () => {
            jest.clearAllMocks(); // Clear all mocks before the test

            const expectedClient = { send: jest.fn() };
            (CognitoIdentityProviderClient as jest.Mock).mockReturnValue(expectedClient);

            const adapter = new CognitoUserMgmtAdapter(configServiceMock, loggerMock);

            expect(CognitoIdentityProviderClient).toHaveBeenCalledTimes(1);
            expect(CognitoIdentityProviderClient).toHaveBeenCalledWith({ region });
            expect(adapter['userPoolId']).toBe(userPoolId);
            expect(loggerMock.info).toHaveBeenCalledWith('CognitoUserMgmtAdapter initialized', { region, userPoolId });
        });
    });

    // --- handleCognitoAdminError Tests ---
    describe('handleCognitoAdminError', () => {
        it('should map UserNotFoundException to UserNotFoundError', () => {
            const cognitoError = new UserNotFoundException({ message: 'User not found', $metadata: {} });
            const mappedError = adapter['handleCognitoAdminError'](cognitoError, 'testOp');
            expect(mappedError).toBeInstanceOf(UserNotFoundError);
            expect(mappedError.message).toContain('testOp');
        });

        it('should map ResourceNotFoundException to NotFoundError', () => {
            const cognitoError = new ResourceNotFoundException({ message: 'Resource not found', $metadata: {} });
            const mappedError = adapter['handleCognitoAdminError'](cognitoError, 'testOp');
            expect(mappedError).toBeInstanceOf(NotFoundError);
            expect(mappedError.message).toContain('testOp');
        });

        it('should map GroupExistsException to GroupExistsError', () => {
            const cognitoError = new GroupExistsException({ message: 'Group exists', $metadata: {} });
            const mappedError = adapter['handleCognitoAdminError'](cognitoError, 'testOp');
            expect(mappedError).toBeInstanceOf(GroupExistsError);
            expect(mappedError.message).toContain('testOp');
        });

        it('should map UsernameExistsException to ValidationError', () => {
            const cognitoError = new UsernameExistsException({ message: 'Username exists', $metadata: {} });
            const mappedError = adapter['handleCognitoAdminError'](cognitoError, 'testOp');
            expect(mappedError).toBeInstanceOf(ValidationError);
            expect(mappedError.message).toContain('testOp');
        });

        it('should map InvalidPasswordException to ValidationError', () => {
            const cognitoError = new InvalidPasswordException({ message: 'Password does not meet requirements.', $metadata: {} });
            const mappedError = adapter['handleCognitoAdminError'](cognitoError, 'testOp');
            expect(mappedError).toBeInstanceOf(ValidationError);
            expect(mappedError.message).toContain('Password does not meet requirements');
        });

        it('should map InvalidParameterException to ValidationError', () => {
            const cognitoError = new InvalidParameterException({ message: 'Invalid param', $metadata: {} });
            const mappedError = adapter['handleCognitoAdminError'](cognitoError, 'testOp');
            expect(mappedError).toBeInstanceOf(ValidationError);
            expect(mappedError.message).toContain('Invalid param');
        });

        it('should map LimitExceededException to BaseError (RateLimitError)', () => {
            const cognitoError = new LimitExceededException({ message: 'Limit exceeded', $metadata: {} });
            const mappedError = adapter['handleCognitoAdminError'](cognitoError, 'testOp');
            expect(mappedError).toBeInstanceOf(BaseError);
            expect(mappedError.name).toBe('RateLimitError');
        });

        it('should map TooManyRequestsException to BaseError (RateLimitError)', () => {
            const cognitoError = new TooManyRequestsException({ message: 'Too many requests', $metadata: {} });
            const mappedError = adapter['handleCognitoAdminError'](cognitoError, 'testOp');
            expect(mappedError).toBeInstanceOf(BaseError);
            expect(mappedError.name).toBe('RateLimitError');
        });

        it('should map NotAuthorizedException to BaseError (AuthorizationError)', () => {
            const cognitoError = new NotAuthorizedException({ message: 'Not authorized', $metadata: {} });
            const mappedError = adapter['handleCognitoAdminError'](cognitoError, 'testOp');
            expect(mappedError).toBeInstanceOf(BaseError);
            expect(mappedError.name).toBe('AuthorizationError');
            expect(loggerMock.error).toHaveBeenCalledWith(expect.stringContaining('CRITICAL: Not Authorized'));
        });

        it('should map InternalErrorException to BaseError (IdPInternalError)', () => {
            const cognitoError = new InternalErrorException({ message: 'Internal error', $metadata: {} });
            const mappedError = adapter['handleCognitoAdminError'](cognitoError, 'testOp');
            expect(mappedError).toBeInstanceOf(BaseError);
            expect(mappedError.name).toBe('IdPInternalError');
        });

        it('should map OpenCircuitError to BaseError (ServiceUnavailableError)', () => {
            const openCircuitError = new Error('OpenCircuitError'); // Opossum throws a generic Error with this name
            openCircuitError.name = 'OpenCircuitError';
            const mappedError = adapter['handleCognitoAdminError'](openCircuitError, 'testOp');
            expect(mappedError).toBeInstanceOf(BaseError);
            expect(mappedError.name).toBe('ServiceUnavailableError');
            expect(loggerMock.warn).toHaveBeenCalledWith(expect.stringContaining('Circuit breaker is open'));
        });

        it('should map unknown errors to generic CognitoAdminInteractionError', () => {
            const unknownError = new Error('Some other error');
            const mappedError = adapter['handleCognitoAdminError'](unknownError, 'testOp');
            expect(mappedError).toBeInstanceOf(BaseError);
            expect(mappedError.name).toBe('CognitoAdminInteractionError');
            expect(mappedError.message).toContain('Some other error');
        });

        it('should log the original error details', () => {
            const testError = new Error('Original error');
            adapter['handleCognitoAdminError'](testError, 'testOp');
            expect(loggerMock.error).toHaveBeenCalledWith(
                expect.stringContaining('Cognito Admin error during testOp'),
                expect.objectContaining({
                    errorName: testError.name,
                    errorMessage: testError.message,
                    stack: testError.stack,
                })
            );
        });
    });

    // --- User Operations ---
    describe('adminCreateUser', () => {
        const userDetails = {
            username: 'testuser',
            temporaryPassword: 'Password123!',
            userAttributes: { email: 'test@example.com' },
        };
        const cognitoUserResponse: UserType = {
            Username: userDetails.username,
            Attributes: [{ Name: 'email', Value: userDetails.userAttributes.email }],
        };

        beforeEach(() => {
            (cognitoClientMock.send as jest.Mock).mockResolvedValue({ User: cognitoUserResponse });
        });

        it('should send AdminCreateUserCommand and return UserType', async () => {
            const result = await adapter.adminCreateUser(userDetails);

            expect(AdminCreateUserCommand).toHaveBeenCalledTimes(1);
            expect(AdminCreateUserCommand).toHaveBeenCalledWith(expect.objectContaining({
                UserPoolId: userPoolId,
                Username: userDetails.username,
                TemporaryPassword: userDetails.temporaryPassword,
                UserAttributes: [{ Name: 'email', Value: 'test@example.com' }],
            }));
            expect(cognitoClientMock.send).toHaveBeenCalledTimes(1);
            expect(result).toEqual(cognitoUserResponse);
            expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('successfully created user'));
        });

        it('should throw mapped error on failure', async () => {
            const cognitoError = new InternalErrorException({ message: 'Internal error', $metadata: {} });
            (cognitoClientMock.send as jest.Mock).mockRejectedValue(cognitoError);

            await expect(adapter.adminCreateUser(userDetails)).rejects.toBeInstanceOf(BaseError);
            await expect(adapter.adminCreateUser(userDetails)).rejects.toHaveProperty('name', 'IdPInternalError');
        });

        it('should apply circuit breaker', async () => {
            jest.clearAllMocks(); // Clear all mocks before the test
            (cognitoClientMock.send as jest.Mock).mockResolvedValueOnce({ User: cognitoUserResponse });

            await adapter.adminCreateUser(userDetails);

            expect(applyCircuitBreaker).toHaveBeenCalledTimes(1);
            expect(applyCircuitBreaker).toHaveBeenCalledWith(expect.any(Function), 'cognitoAdmin', loggerMock);
            expect(cognitoClientMock.send).toHaveBeenCalledTimes(1);
        });
    });

    describe('adminGetUser', () => {
        const username = 'testuser';
        const cognitoUserResponse: AdminGetUserCommandOutput = {
            Username: username,
            UserAttributes: [{ Name: 'email', Value: 'test@example.com' }],
            $metadata: {},
        };

        beforeEach(() => {
            (cognitoClientMock.send as jest.Mock).mockResolvedValue(cognitoUserResponse);
        });

        it('should send AdminGetUserCommand and return UserType', async () => {
            const result = await adapter.adminGetUser(username);

            expect(AdminGetUserCommand).toHaveBeenCalledTimes(1);
            expect(AdminGetUserCommand).toHaveBeenCalledWith({ UserPoolId: userPoolId, Username: username });
            expect(cognitoClientMock.send).toHaveBeenCalledTimes(1);
            expect(result?.Username).toBe(username);
            expect(loggerMock.debug).toHaveBeenCalledWith(expect.stringContaining('successfully retrieved user'));
        });

        it('should return null if UserNotFoundException is thrown', async () => {
            (cognitoClientMock.send as jest.Mock).mockRejectedValue(new UserNotFoundException({ message: 'Not found', $metadata: {} }));
            const result = await adapter.adminGetUser(username);
            expect(result).toBeNull();
            expect(loggerMock.debug).toHaveBeenCalledWith(expect.stringContaining('User not found'));
        });

        it('should throw mapped error on other failures', async () => {
            const cognitoError = new InternalErrorException({ message: 'Internal error', $metadata: {} });
            (cognitoClientMock.send as jest.Mock).mockRejectedValue(cognitoError);
            await expect(adapter.adminGetUser(username)).rejects.toBeInstanceOf(BaseError);
        });
    });

    describe('adminUpdateUserAttributes', () => {
        const userDetails = {
            username: 'testuser',
            attributesToUpdate: { email: 'new@example.com' },
        };

        beforeEach(() => {
            (cognitoClientMock.send as jest.Mock).mockResolvedValue({});
        });

        it('should send AdminUpdateUserAttributesCommand', async () => {
            await adapter.adminUpdateUserAttributes(userDetails);

            expect(AdminUpdateUserAttributesCommand).toHaveBeenCalledTimes(1);
            expect(AdminUpdateUserAttributesCommand).toHaveBeenCalledWith(expect.objectContaining({
                UserPoolId: userPoolId,
                Username: userDetails.username,
                UserAttributes: [{ Name: 'email', Value: 'new@example.com' }],
            }));
            expect(cognitoClientMock.send).toHaveBeenCalledTimes(1);
            expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('successfully updated attributes'));
        });

        it('should throw mapped error on failure', async () => {
            const cognitoError = new InvalidParameterException({ message: 'Invalid param', $metadata: {} });
            (cognitoClientMock.send as jest.Mock).mockRejectedValue(cognitoError);
            await expect(adapter.adminUpdateUserAttributes(userDetails)).rejects.toBeInstanceOf(ValidationError);
        });
    });

    describe('adminDeleteUser', () => {
        const username = 'testuser';

        beforeEach(() => {
            (cognitoClientMock.send as jest.Mock).mockResolvedValue({});
        });

        it('should send AdminDeleteUserCommand', async () => {
            await adapter.adminDeleteUser(username);

            expect(AdminDeleteUserCommand).toHaveBeenCalledTimes(1);
            expect(AdminDeleteUserCommand).toHaveBeenCalledWith({ UserPoolId: userPoolId, Username: username });
            expect(cognitoClientMock.send).toHaveBeenCalledTimes(1);
            expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('successfully deleted user'));
        });

        it('should throw mapped error on failure', async () => {
            const cognitoError = new InternalErrorException({ message: 'Internal error', $metadata: {} });
            (cognitoClientMock.send as jest.Mock).mockRejectedValue(cognitoError);
            await expect(adapter.adminDeleteUser(username)).rejects.toBeInstanceOf(BaseError);
        });
    });

    describe('adminDisableUser', () => {
        const username = 'testuser';

        beforeEach(() => {
            (cognitoClientMock.send as jest.Mock).mockResolvedValue({});
        });

        it('should send AdminDisableUserCommand', async () => {
            await adapter.adminDisableUser(username);

            expect(AdminDisableUserCommand).toHaveBeenCalledTimes(1);
            expect(AdminDisableUserCommand).toHaveBeenCalledWith({ UserPoolId: userPoolId, Username: username });
            expect(cognitoClientMock.send).toHaveBeenCalledTimes(1);
            expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('successfully disabled user'));
        });

        it('should throw mapped error on failure', async () => {
            const cognitoError = new InternalErrorException({ message: 'Internal error', $metadata: {} });
            (cognitoClientMock.send as jest.Mock).mockRejectedValue(cognitoError);
            await expect(adapter.adminDisableUser(username)).rejects.toBeInstanceOf(BaseError);
        });
    });

    describe('adminEnableUser', () => {
        const username = 'testuser';

        beforeEach(() => {
            (cognitoClientMock.send as jest.Mock).mockResolvedValue({});
        });

        it('should send AdminEnableUserCommand', async () => {
            await adapter.adminEnableUser(username);

            expect(AdminEnableUserCommand).toHaveBeenCalledTimes(1);
            expect(AdminEnableUserCommand).toHaveBeenCalledWith({ UserPoolId: userPoolId, Username: username });
            expect(cognitoClientMock.send).toHaveBeenCalledTimes(1);
            expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('successfully enabled user'));
        });

        it('should throw mapped error on failure', async () => {
            const cognitoError = new InternalErrorException({ message: 'Internal error', $metadata: {} });
            (cognitoClientMock.send as jest.Mock).mockRejectedValue(cognitoError);
            await expect(adapter.adminEnableUser(username)).rejects.toBeInstanceOf(BaseError);
        });
    });

    describe('adminInitiatePasswordReset', () => {
        const username = 'testuser';

        beforeEach(() => {
            (cognitoClientMock.send as jest.Mock).mockResolvedValue({});
        });

        it('should send AdminResetUserPasswordCommand', async () => {
            await adapter.adminInitiatePasswordReset(username);

            expect(AdminResetUserPasswordCommand).toHaveBeenCalledTimes(1);
            expect(AdminResetUserPasswordCommand).toHaveBeenCalledWith({ UserPoolId: userPoolId, Username: username });
            expect(cognitoClientMock.send).toHaveBeenCalledTimes(1);
            expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('successfully initiated password reset'));
        });

        it('should throw mapped error on failure', async () => {
            const cognitoError = new InternalErrorException({ message: 'Internal error', $metadata: {} });
            (cognitoClientMock.send as jest.Mock).mockRejectedValue(cognitoError);
            await expect(adapter.adminInitiatePasswordReset(username)).rejects.toBeInstanceOf(BaseError);
        });
    });

    describe('adminSetUserPassword', () => {
        const username = 'testuser';
        const password = 'NewPassword123!';
        const permanent = true;

        beforeEach(() => {
            (cognitoClientMock.send as jest.Mock).mockResolvedValue({});
        });

        it('should send AdminSetUserPasswordCommand', async () => {
            await adapter.adminSetUserPassword(username, password, permanent);

            expect(AdminSetUserPasswordCommand).toHaveBeenCalledTimes(1);
            expect(AdminSetUserPasswordCommand).toHaveBeenCalledWith({
                UserPoolId: userPoolId,
                Username: username,
                Password: password,
                Permanent: permanent,
            });
            expect(cognitoClientMock.send).toHaveBeenCalledTimes(1);
            expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('successfully set password'));
        });

        it('should throw mapped error on failure', async () => {
            const cognitoError = new InternalErrorException({ message: 'Internal error', $metadata: {} });
            (cognitoClientMock.send as jest.Mock).mockRejectedValue(cognitoError);
            await expect(adapter.adminSetUserPassword(username, password, permanent)).rejects.toBeInstanceOf(BaseError);
        });
    });

    describe('adminAddUserToGroup', () => {
        const username = 'testuser';
        const groupName = 'testgroup';

        beforeEach(() => {
            (cognitoClientMock.send as jest.Mock).mockResolvedValue({});
        });

        it('should send AdminAddUserToGroupCommand', async () => {
            await adapter.adminAddUserToGroup(username, groupName);

            expect(AdminAddUserToGroupCommand).toHaveBeenCalledTimes(1);
            expect(AdminAddUserToGroupCommand).toHaveBeenCalledWith({ UserPoolId: userPoolId, Username: username, GroupName: groupName });
            expect(cognitoClientMock.send).toHaveBeenCalledTimes(1);
            expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('successfully added user'));
        });

        it('should throw mapped error on failure', async () => {
            const cognitoError = new InternalErrorException({ message: 'Internal error', $metadata: {} });
            (cognitoClientMock.send as jest.Mock).mockRejectedValue(cognitoError);
            await expect(adapter.adminAddUserToGroup(username, groupName)).rejects.toBeInstanceOf(BaseError);
        });
    });

    describe('adminRemoveUserFromGroup', () => {
        const username = 'testuser';
        const groupName = 'testgroup';

        beforeEach(() => {
            (cognitoClientMock.send as jest.Mock).mockResolvedValue({});
        });

        it('should send AdminRemoveUserFromGroupCommand', async () => {
            await adapter.adminRemoveUserFromGroup(username, groupName);

            expect(AdminRemoveUserFromGroupCommand).toHaveBeenCalledTimes(1);
            expect(AdminRemoveUserFromGroupCommand).toHaveBeenCalledWith({ UserPoolId: userPoolId, Username: username, GroupName: groupName });
            expect(cognitoClientMock.send).toHaveBeenCalledTimes(1);
            expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('successfully removed user'));
        });

        it('should throw mapped error on failure', async () => {
            const cognitoError = new InternalErrorException({ message: 'Internal error', $metadata: {} });
            (cognitoClientMock.send as jest.Mock).mockRejectedValue(cognitoError);
            await expect(adapter.adminRemoveUserFromGroup(username, groupName)).rejects.toBeInstanceOf(BaseError);
        });
    });

    describe('adminListGroupsForUser', () => {
        const username = 'testuser';
        const cognitoGroupsResponse: GroupType[] = [{ GroupName: 'group1' }, { GroupName: 'group2' }];

        beforeEach(() => {
            (cognitoClientMock.send as jest.Mock).mockResolvedValue({ Groups: cognitoGroupsResponse, NextToken: 'token' });
        });

        it('should send AdminListGroupsForUserCommand and return groups', async () => {
            const result = await adapter.adminListGroupsForUser(username);

            expect(AdminListGroupsForUserCommand).toHaveBeenCalledTimes(1);
            expect(AdminListGroupsForUserCommand).toHaveBeenCalledWith({ UserPoolId: userPoolId, Username: username, Limit: undefined, NextToken: undefined });
            expect(cognitoClientMock.send).toHaveBeenCalledTimes(1);
            expect(result.groups).toEqual(cognitoGroupsResponse);
            expect(result.nextToken).toBe('token');
            expect(loggerMock.debug).toHaveBeenCalledWith(expect.stringContaining('successfully listed groups'));
        });

        it('should handle limit and nextToken', async () => {
            await adapter.adminListGroupsForUser(username, 10, 'next-token');
            expect(AdminListGroupsForUserCommand).toHaveBeenCalledWith(expect.objectContaining({ Limit: 10, NextToken: 'next-token' }));
        });

        it('should return empty array if no groups', async () => {
            (cognitoClientMock.send as jest.Mock).mockResolvedValue({ Groups: [] });
            const result = await adapter.adminListGroupsForUser(username);
            expect(result.groups).toEqual([]);
        });

        it('should throw mapped error on failure', async () => {
            const cognitoError = new InternalErrorException({ message: 'Internal error', $metadata: {} });
            (cognitoClientMock.send as jest.Mock).mockRejectedValue(cognitoError);
            await expect(adapter.adminListGroupsForUser(username)).rejects.toBeInstanceOf(BaseError);
        });
    });

    describe('adminListUsers', () => {
        const cognitoUsersResponse: UserType[] = [
            { Username: 'user1', UserStatus: 'CONFIRMED' },
            { Username: 'user2', UserStatus: 'UNCONFIRMED' },
        ];

        beforeEach(() => {
            (cognitoClientMock.send as jest.Mock).mockResolvedValue({ Users: cognitoUsersResponse, PaginationToken: 'token' });
        });

        it('should send ListUsersCommand and return users', async () => {
            const result = await adapter.adminListUsers({});

            expect(ListUsersCommand).toHaveBeenCalledTimes(1);
            expect(ListUsersCommand).toHaveBeenCalledWith(expect.objectContaining({
                UserPoolId: userPoolId,
                Limit: undefined,
                PaginationToken: undefined,
                Filter: undefined,
            }));
            expect(cognitoClientMock.send).toHaveBeenCalledTimes(1);
            expect(result.users).toEqual(cognitoUsersResponse);
            expect(result.paginationToken).toBe('token');
            expect(loggerMock.debug).toHaveBeenCalledWith(expect.stringContaining('successfully listed users'));
        });

        it('should handle limit, paginationToken, and filter', async () => {
            await adapter.adminListUsers({ limit: 10, paginationToken: 'next', filter: 'test' });
            expect(ListUsersCommand).toHaveBeenCalledWith(expect.objectContaining({
                Limit: 10,
                PaginationToken: 'next',
                Filter: 'test',
            }));
        });

        it('should filter users by status if provided', async () => {
            const result = await adapter.adminListUsers({ status: 'CONFIRMED' });
            expect(result.users).toEqual([{ Username: 'user1', UserStatus: 'CONFIRMED' }]);
        });

        it('should throw mapped error on failure', async () => {
            const cognitoError = new InternalErrorException({ message: 'Internal error', $metadata: {} });
            (cognitoClientMock.send as jest.Mock).mockRejectedValue(cognitoError);
            await expect(adapter.adminListUsers({})).rejects.toBeInstanceOf(BaseError);
        });
    });

    describe('adminListUsersInGroup', () => {
        const groupName = 'testgroup';
        const cognitoUsersResponse: UserType[] = [{ Username: 'user1' }, { Username: 'user2' }];

        beforeEach(() => {
            (cognitoClientMock.send as jest.Mock).mockResolvedValue({ Users: cognitoUsersResponse, NextToken: 'token' });
        });

        it('should send ListUsersInGroupCommand and return users', async () => {
            const result = await adapter.adminListUsersInGroup(groupName);

            expect(ListUsersInGroupCommand).toHaveBeenCalledTimes(1);
            expect(ListUsersInGroupCommand).toHaveBeenCalledWith({ UserPoolId: userPoolId, GroupName: groupName, Limit: undefined, NextToken: undefined });
            expect(cognitoClientMock.send).toHaveBeenCalledTimes(1);
            expect(result.users).toEqual(cognitoUsersResponse);
            expect(result.nextToken).toBe('token');
            expect(loggerMock.debug).toHaveBeenCalledWith(expect.stringContaining('successfully listed users in group'));
        });

        it('should handle limit and nextToken', async () => {
            await adapter.adminListUsersInGroup(groupName, 10, 'next-token');
            expect(ListUsersInGroupCommand).toHaveBeenCalledWith(expect.objectContaining({ Limit: 10, NextToken: 'next-token' }));
        });

        it('should throw mapped error on failure', async () => {
            const cognitoError = new InternalErrorException({ message: 'Internal error', $metadata: {} });
            (cognitoClientMock.send as jest.Mock).mockRejectedValue(cognitoError);
            await expect(adapter.adminListUsersInGroup(groupName)).rejects.toBeInstanceOf(BaseError);
        });
    });

    // --- Group Operations ---
    describe('adminCreateGroup', () => {
        const groupDetails = {
            groupName: 'testgroup',
            description: 'A test group',
            precedence: 1,
        };
        const cognitoGroupResponse: GroupType = {
            GroupName: groupDetails.groupName,
            Description: JSON.stringify({ description: groupDetails.description, status: 'ACTIVE' }),
            Precedence: groupDetails.precedence,
        };

        beforeEach(() => {
            (cognitoClientMock.send as jest.Mock).mockResolvedValue({ Group: cognitoGroupResponse });
        });

        it('should send CreateGroupCommand and return GroupType', async () => {
            const result = await adapter.adminCreateGroup(groupDetails);

            expect(CreateGroupCommand).toHaveBeenCalledTimes(1);
            expect(CreateGroupCommand).toHaveBeenCalledWith(expect.objectContaining({
                UserPoolId: userPoolId,
                GroupName: groupDetails.groupName,
                Description: JSON.stringify({ description: groupDetails.description, status: 'ACTIVE' }),
                Precedence: groupDetails.precedence,
            }));
            expect(cognitoClientMock.send).toHaveBeenCalledTimes(1);
            expect(result).toEqual(cognitoGroupResponse);
            expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('successfully created group'));
        });

        it('should throw mapped error on failure', async () => {
            const cognitoError = new GroupExistsException({ message: 'Group exists', $metadata: {} });
            (cognitoClientMock.send as jest.Mock).mockRejectedValue(cognitoError);
            await expect(adapter.adminCreateGroup(groupDetails)).rejects.toBeInstanceOf(GroupExistsError);
        });
    });

    describe('adminDeleteGroup', () => {
        const groupName = 'testgroup';

        beforeEach(() => {
            // Mock adminUpdateGroupStatus internal call
            jest.spyOn(adapter as any, 'adminUpdateGroupStatus').mockResolvedValue(undefined);
        });

        it('should call adminUpdateGroupStatus to deactivate the group', async () => {
            await adapter.adminDeleteGroup(groupName);
            expect(adapter['adminUpdateGroupStatus']).toHaveBeenCalledWith(groupName, 'INACTIVE');
            expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('successfully deactivated group'));
        });

        it('should re-throw error from adminUpdateGroupStatus', async () => {
            const testError = new Error('Update status failed');
            jest.spyOn(adapter as any, 'adminUpdateGroupStatus').mockRejectedValue(testError);
            await expect(adapter.adminDeleteGroup(groupName)).rejects.toThrow(testError);
        });
    });

    describe('adminReactivateGroup', () => {
        const groupName = 'testgroup';

        beforeEach(() => {
            // Mock adminUpdateGroupStatus internal call
            jest.spyOn(adapter as any, 'adminUpdateGroupStatus').mockResolvedValue(undefined);
        });

        it('should call adminUpdateGroupStatus to reactivate the group', async () => {
            await adapter.adminReactivateGroup(groupName);
            expect(adapter['adminUpdateGroupStatus']).toHaveBeenCalledWith(groupName, 'ACTIVE');
            expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('successfully reactivated group'));
        });

        it('should re-throw error from adminUpdateGroupStatus', async () => {
            const testError = new Error('Update status failed');
            jest.spyOn(adapter as any, 'adminUpdateGroupStatus').mockRejectedValue(testError);
            await expect(adapter.adminReactivateGroup(groupName)).rejects.toThrow(testError);
        });
    });

    describe('adminUpdateGroupStatus (private)', () => {
        const groupName = 'testgroup';
        const existingGroup: GroupType = {
            GroupName: groupName,
            Description: JSON.stringify({ description: 'Original desc', status: 'ACTIVE' }),
            Precedence: 1,
        };

        beforeEach(() => {
            // Mock adminGetGroup internal call
            jest.spyOn(adapter as any, 'adminGetGroup').mockResolvedValue(existingGroup);
            (cognitoClientMock.send as jest.Mock).mockResolvedValue({});
        });

        it('should update group status to INACTIVE', async () => {
            await adapter['adminUpdateGroupStatus'](groupName, 'INACTIVE');

            expect(UpdateGroupCommand).toHaveBeenCalledTimes(1);
            expect(UpdateGroupCommand).toHaveBeenCalledWith(expect.objectContaining({
                GroupName: groupName,
                Description: JSON.stringify({ description: 'Original desc', status: 'INACTIVE' }),
                Precedence: 1,
            }));
            expect(cognitoClientMock.send).toHaveBeenCalledTimes(1);
        });

        it('should update group status to ACTIVE', async () => {
            // Simulate existing group being INACTIVE
            jest.spyOn(adapter as any, 'adminGetGroup').mockResolvedValue({
                ...existingGroup,
                Description: JSON.stringify({ description: 'Original desc', status: 'INACTIVE' }),
            });

            await adapter['adminUpdateGroupStatus'](groupName, 'ACTIVE');

            expect(UpdateGroupCommand).toHaveBeenCalledWith(expect.objectContaining({
                Description: JSON.stringify({ description: 'Original desc', status: 'ACTIVE' }),
            }));
        });

        it('should throw NotFoundError if group does not exist', async () => {
            jest.spyOn(adapter as any, 'adminGetGroup').mockResolvedValue(null);
            await expect(adapter['adminUpdateGroupStatus'](groupName, 'ACTIVE')).rejects.toBeInstanceOf(NotFoundError);
        });

        it('should handle non-JSON description gracefully', async () => {
            jest.spyOn(adapter as any, 'adminGetGroup').mockResolvedValue({
                ...existingGroup,
                Description: 'Plain text description',
            });

            await adapter['adminUpdateGroupStatus'](groupName, 'INACTIVE');

            expect(UpdateGroupCommand).toHaveBeenCalledWith(expect.objectContaining({
                Description: JSON.stringify({ description: 'Plain text description', status: 'INACTIVE' }),
            }));
        });

        it('should throw mapped error on failure', async () => {
            const cognitoError = new InternalErrorException({ message: 'Internal error', $metadata: {} });
            (cognitoClientMock.send as jest.Mock).mockRejectedValue(cognitoError);
            await expect(adapter['adminUpdateGroupStatus'](groupName, 'ACTIVE')).rejects.toBeInstanceOf(BaseError);
        });
    });

    describe('adminGetGroup', () => {
        const groupName = 'testgroup';
        const cognitoGroupResponse: GroupType = {
            GroupName: groupName,
            Description: JSON.stringify({
                description: 'Test description',
                status: 'ACTIVE'
            })
        };

        beforeEach(() => {
            const mockSend = (command: any) => {
                if (command instanceof GetGroupCommand) {
                    return Promise.resolve({ Group: cognitoGroupResponse, $metadata: {} });
                }
                return Promise.resolve({ $metadata: {} });
            };
            (cognitoClientMock.send as jest.Mock).mockImplementation(mockSend);
        });

        it('should send GetGroupCommand and return GroupType', async () => {
            const result = await adapter.adminGetGroup(groupName);

            expect(GetGroupCommand).toHaveBeenCalledTimes(1);
            expect(GetGroupCommand).toHaveBeenCalledWith({ UserPoolId: userPoolId, GroupName: groupName });
            expect(result).toEqual(cognitoGroupResponse);
            expect(loggerMock.debug).toHaveBeenCalledWith(expect.stringContaining('successfully retrieved group'));
        });

        it('should return null if ResourceNotFoundException is thrown', async () => {
            (cognitoClientMock.send as jest.Mock).mockRejectedValue(
                new ResourceNotFoundException({ message: 'Not found', $metadata: {} })
            );
            const result = await adapter.adminGetGroup(groupName);
            expect(result).toBeNull();
            expect(loggerMock.debug).toHaveBeenCalledWith(expect.stringContaining('Group not found'));
        });

        it('should throw mapped error on other failures', async () => {
            (cognitoClientMock.send as jest.Mock).mockRejectedValue(
                new InternalErrorException({ message: 'Internal error', $metadata: {} })
            );
            await expect(adapter.adminGetGroup(groupName)).rejects.toBeInstanceOf(BaseError);
            await expect(adapter.adminGetGroup(groupName)).rejects.toHaveProperty('name', 'IdPInternalError');
        });

        it('should return null if Cognito returns success but no group object', async () => {
            (cognitoClientMock.send as jest.Mock).mockResolvedValue({ $metadata: {} });
            const result = await adapter.adminGetGroup(groupName);
            expect(result).toBeNull();
            expect(loggerMock.warn).toHaveBeenCalledWith(expect.stringContaining('Cognito returned success but no group object'));
        });
    });

    describe('adminListGroups', () => {
        const cognitoGroupsResponse: GroupType[] = [
            {
                GroupName: 'group1',
                Description: JSON.stringify({ description: 'desc1', status: 'ACTIVE' })
            },
            {
                GroupName: 'group2',
                Description: JSON.stringify({ description: 'desc2', status: 'ACTIVE' })
            }
        ];

        beforeEach(() => {
            const mockSend = (command: any) => {
                if (command instanceof ListGroupsCommand) {
                    return Promise.resolve({
                        Groups: cognitoGroupsResponse,
                        NextToken: 'token',
                        $metadata: {}
                    });
                }
                return Promise.resolve({ $metadata: {} });
            };
            (cognitoClientMock.send as jest.Mock).mockImplementation(mockSend);
        });

        it('should send ListGroupsCommand and return groups', async () => {
            const result = await adapter.adminListGroups();

            expect(ListGroupsCommand).toHaveBeenCalledTimes(1);
            expect(ListGroupsCommand).toHaveBeenCalledWith(expect.objectContaining({
                UserPoolId: userPoolId,
                Limit: undefined,
                NextToken: undefined,
            }));
            expect(result.groups).toEqual(cognitoGroupsResponse);
            expect(result.nextToken).toBe('token');
            expect(loggerMock.debug).toHaveBeenCalledWith(expect.stringContaining('successfully listed groups'));
        });

        it('should handle limit and nextToken', async () => {
            await adapter.adminListGroups(10, 'next-token');
            expect(ListGroupsCommand).toHaveBeenCalledWith(expect.objectContaining({
                Limit: 10,
                NextToken: 'next-token'
            }));
        });

        it('should filter groups by name or description if filter is provided', async () => {
            const result = await adapter.adminListGroups(undefined, undefined, 'group1');
            expect(result.groups).toEqual([cognitoGroupsResponse[0]]);
        });

        it('should return empty array if no groups', async () => {
            (cognitoClientMock.send as jest.Mock).mockResolvedValue({
                Groups: [],
                $metadata: {}
            });
            const result = await adapter.adminListGroups();
            expect(result.groups).toEqual([]);
        });

        it('should throw mapped error on failure', async () => {
            (cognitoClientMock.send as jest.Mock).mockRejectedValue(
                new InternalErrorException({ message: 'Internal error', $metadata: {} })
            );
            await expect(adapter.adminListGroups()).rejects.toBeInstanceOf(BaseError);
            await expect(adapter.adminListGroups()).rejects.toHaveProperty('name', 'IdPInternalError');
        });
    });
});