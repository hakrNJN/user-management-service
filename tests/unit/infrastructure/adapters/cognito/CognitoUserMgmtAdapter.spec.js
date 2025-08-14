"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
// tests/unit/infrastructure/adapters/cognito/CognitoUserMgmtAdapter.spec.ts
const client_cognito_identity_provider_1 = require("@aws-sdk/client-cognito-identity-provider");
const aws_sdk_client_mock_1 = require("aws-sdk-client-mock");
require("aws-sdk-client-mock-jest"); // Extends Jest expect
require("reflect-metadata");
const UserManagementError_1 = require("../../../../../src/domain/exceptions/UserManagementError");
const CognitoUserMgmtAdapter_1 = require("../../../../../src/infrastructure/adapters/cognito/CognitoUserMgmtAdapter");
const BaseError_1 = require("../../../../../src/shared/errors/BaseError");
const config_mock_1 = require("../../../../mocks/config.mock");
const logger_mock_1 = require("../../../../mocks/logger.mock");
// --- Mocks ---
const cognitoMock = (0, aws_sdk_client_mock_1.mockClient)(client_cognito_identity_provider_1.CognitoIdentityProviderClient);
const MOCK_USER_POOL_ID = 'us-east-1_testPoolId'; // Consistent Pool ID for tests
const MOCK_AWS_REGION = 'us-east-1';
describe('CognitoUserMgmtAdapter', () => {
    let adapter;
    let configService;
    let logger;
    beforeEach(() => {
        cognitoMock.reset();
        jest.clearAllMocks();
        // Use fresh mocks
        configService = Object.assign({}, config_mock_1.mockConfigService);
        logger = Object.assign({}, logger_mock_1.mockLogger);
        // --- FIX: Configure mockConfigService for THIS test suite ---
        // Ensure getOrThrow returns the necessary values for constructor
        configService.getOrThrow.mockImplementation((key) => {
            if (key === 'AWS_REGION')
                return MOCK_AWS_REGION;
            if (key === 'COGNITO_USER_POOL_ID')
                return MOCK_USER_POOL_ID;
            throw new Error(`MockConfigService: Missing mock for required key "${key}"`);
        });
        // If adapter constructor *also* uses .get(), mock that too if necessary
        configService.get.mockImplementation((key, defaultValue) => {
            if (key === 'AWS_REGION')
                return MOCK_AWS_REGION; // For consistency if get is used elsewhere
            // If get is used for non-essential config, provide defaults or return defaultValue
            return defaultValue;
        });
        // --- End Fix ---
        // Instantiate the actual adapter with the mocked dependencies
        adapter = new CognitoUserMgmtAdapter_1.CognitoUserMgmtAdapter(configService, logger);
    });
    it('should initialize correctly', () => {
        expect(adapter).toBeDefined();
        expect(configService.getOrThrow).toHaveBeenCalledWith('AWS_REGION');
        expect(configService.getOrThrow).toHaveBeenCalledWith('COGNITO_USER_POOL_ID');
        expect(logger.info).toHaveBeenCalledWith('CognitoUserMgmtAdapter initialized', expect.any(Object));
    });
    // --- Test adminCreateUser ---
    describe('adminCreateUser', () => {
        const createDetails = {
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
        it('should create a user successfully and return UserType', () => __awaiter(void 0, void 0, void 0, function* () {
            const mockCognitoResponse = {
                User: {
                    Username: 'cognito-uuid-123', // Cognito often returns sub as Username here
                    Attributes: cognitoAttributes,
                    UserCreateDate: new Date(),
                    UserLastModifiedDate: new Date(),
                    Enabled: true,
                    UserStatus: 'FORCE_CHANGE_PASSWORD',
                },
            };
            cognitoMock.on(client_cognito_identity_provider_1.AdminCreateUserCommand).resolves(mockCognitoResponse);
            const result = yield adapter.adminCreateUser(createDetails);
            // Check the returned UserType object
            expect(result).toBeDefined();
            expect(result).toEqual(mockCognitoResponse.User);
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Admin successfully created user: ${createDetails.username}`) // Be less strict about the metadata object structure for now
            );
            // Verify the command was called correctly
            expect(cognitoMock).toHaveReceivedCommandWith(client_cognito_identity_provider_1.AdminCreateUserCommand, {
                UserPoolId: MOCK_USER_POOL_ID,
                Username: createDetails.username,
                TemporaryPassword: createDetails.temporaryPassword,
                UserAttributes: cognitoAttributes,
                MessageAction: undefined, // Because suppressWelcomeMessage is false
                ForceAliasCreation: createDetails.forceAliasCreation,
                DesiredDeliveryMediums: ['EMAIL'], // Derived from email attribute
            });
        }));
        it('should throw ValidationError if username exists (mapped from UsernameExistsException)', () => __awaiter(void 0, void 0, void 0, function* () {
            const cognitoError = new client_cognito_identity_provider_1.UsernameExistsException({
                message: 'User already exists',
                $metadata: {},
            });
            cognitoMock.on(client_cognito_identity_provider_1.AdminCreateUserCommand).rejects(cognitoError);
            yield expect(adapter.adminCreateUser(createDetails))
                .rejects
                .toThrow(BaseError_1.ValidationError); // Expect mapped error
            yield expect(adapter.adminCreateUser(createDetails))
                .rejects
                .toHaveProperty('message', expect.stringContaining('Username already exists'));
            expect(logger.error).toHaveBeenCalled();
        }));
        it('should throw ValidationError for invalid parameters (mapped from InvalidParameterException)', () => __awaiter(void 0, void 0, void 0, function* () {
            const cognitoError = new client_cognito_identity_provider_1.InvalidParameterException({
                message: 'Invalid parameter foo',
                $metadata: {},
            });
            cognitoMock.on(client_cognito_identity_provider_1.AdminCreateUserCommand).rejects(cognitoError);
            const invalidDetails = Object.assign(Object.assign({}, createDetails), { username: 'invalid username' });
            yield expect(adapter.adminCreateUser(invalidDetails))
                .rejects
                .toThrow(BaseError_1.ValidationError); // Expect mapped error
            yield expect(adapter.adminCreateUser(invalidDetails))
                .rejects
                .toHaveProperty('message', expect.stringContaining('Invalid parameters. Invalid parameter foo'));
            expect(logger.error).toHaveBeenCalled();
        }));
        it('should throw ValidationError for invalid password (mapped from InvalidPasswordException)', () => __awaiter(void 0, void 0, void 0, function* () {
            const cognitoError = new client_cognito_identity_provider_1.InvalidPasswordException({
                message: 'Password does not meet requirements',
                $metadata: {},
            });
            cognitoMock.on(client_cognito_identity_provider_1.AdminCreateUserCommand).rejects(cognitoError);
            const invalidDetails = Object.assign(Object.assign({}, createDetails), { temporaryPassword: 'short' });
            yield expect(adapter.adminCreateUser(invalidDetails))
                .rejects
                .toThrow(BaseError_1.ValidationError); // Expect mapped error
            yield expect(adapter.adminCreateUser(invalidDetails))
                .rejects
                .toHaveProperty('message', expect.stringContaining('Password does not meet requirements'));
            expect(logger.error).toHaveBeenCalled();
        }));
        it('should throw BaseError for generic errors during user creation', () => __awaiter(void 0, void 0, void 0, function* () {
            const genericError = new Error('Something went wrong');
            cognitoMock.on(client_cognito_identity_provider_1.AdminCreateUserCommand).rejects(genericError);
            yield expect(adapter.adminCreateUser(createDetails))
                .rejects
                .toThrow(BaseError_1.BaseError); // Expect mapped base error
            yield expect(adapter.adminCreateUser(createDetails))
                .rejects
                .toHaveProperty('message', expect.stringContaining('adminCreateUser failed: Something went wrong'));
            expect(logger.error).toHaveBeenCalled();
        }));
    });
    // --- Test adminGetUser ---
    describe('adminGetUser', () => {
        const testUsername = 'test@example.com'; // Or a UUID if that's your username
        it('should return UserType data if user exists', () => __awaiter(void 0, void 0, void 0, function* () {
            // Explicitly type the mock response to match the command output
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
                UserStatus: client_cognito_identity_provider_1.UserStatusType.CONFIRMED,
                MFAOptions: [],
                $metadata: {}, // Add required $metadata property
            };
            cognitoMock.on(client_cognito_identity_provider_1.AdminGetUserCommand).resolves(mockCognitoResponse);
            const result = yield adapter.adminGetUser(testUsername);
            // Check the returned UserType object (adapter extracts relevant fields)
            // The adapter's adminGetUser returns UserType | null, not the full CommandOutput
            expect(result).toBeDefined();
            expect(result === null || result === void 0 ? void 0 : result.Username).toEqual(testUsername);
            expect(result === null || result === void 0 ? void 0 : result.UserStatus).toEqual(client_cognito_identity_provider_1.UserStatusType.CONFIRMED);
            expect(result === null || result === void 0 ? void 0 : result.Attributes).toEqual(mockCognitoResponse.UserAttributes);
            expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining(`Admin successfully retrieved user: ${testUsername}`));
            expect(cognitoMock).toHaveReceivedCommandWith(client_cognito_identity_provider_1.AdminGetUserCommand, {
                UserPoolId: MOCK_USER_POOL_ID,
                Username: testUsername,
            });
        }));
        it('should return null if user does not exist (UserNotFoundException)', () => __awaiter(void 0, void 0, void 0, function* () {
            const cognitoError = new client_cognito_identity_provider_1.UserNotFoundException({
                message: 'User not found',
                $metadata: {},
            });
            cognitoMock.on(client_cognito_identity_provider_1.AdminGetUserCommand).rejects(cognitoError);
            const result = yield adapter.adminGetUser(testUsername);
            expect(result).toBeNull(); // Adapter handles this specific error to return null
            expect(logger.debug).toHaveBeenCalledWith(`adminGetUser - User not found: ${testUsername}`);
            expect(cognitoMock).toHaveReceivedCommandWith(client_cognito_identity_provider_1.AdminGetUserCommand, {
                UserPoolId: MOCK_USER_POOL_ID,
                Username: testUsername,
            });
        }));
        it('should throw BaseError for generic errors during get user', () => __awaiter(void 0, void 0, void 0, function* () {
            const genericError = new Error('AWS Cognito Error');
            cognitoMock.on(client_cognito_identity_provider_1.AdminGetUserCommand).rejects(genericError);
            yield expect(adapter.adminGetUser(testUsername))
                .rejects
                .toThrow(BaseError_1.BaseError); // Expect mapped base error
            yield expect(adapter.adminGetUser(testUsername))
                .rejects
                .toHaveProperty('message', expect.stringContaining('adminGetUser failed: AWS Cognito Error'));
            expect(logger.error).toHaveBeenCalled();
        }));
    });
    // --- Test adminUpdateUserAttributes ---
    describe('adminUpdateUserAttributes', () => {
        const updateDetails = {
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
        it('should update user attributes successfully (returns void)', () => __awaiter(void 0, void 0, void 0, function* () {
            // AdminUpdateUserAttributes returns {} on success
            cognitoMock.on(client_cognito_identity_provider_1.AdminUpdateUserAttributesCommand).resolves({});
            yield expect(adapter.adminUpdateUserAttributes(updateDetails))
                .resolves
                .toBeUndefined(); // Expect void on success
            expect(cognitoMock).toHaveReceivedCommandWith(client_cognito_identity_provider_1.AdminUpdateUserAttributesCommand, {
                UserPoolId: MOCK_USER_POOL_ID,
                Username: updateDetails.username,
                UserAttributes: expectedCognitoAttributes,
            });
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Admin successfully updated attributes'));
        }));
        it('should throw UserNotFoundError if user does not exist (mapped from UserNotFoundException)', () => __awaiter(void 0, void 0, void 0, function* () {
            const cognitoError = new client_cognito_identity_provider_1.UserNotFoundException({
                message: 'User not found',
                $metadata: {},
            });
            cognitoMock.on(client_cognito_identity_provider_1.AdminUpdateUserAttributesCommand).rejects(cognitoError);
            yield expect(adapter.adminUpdateUserAttributes(updateDetails))
                .rejects
                .toThrow(UserManagementError_1.UserNotFoundError); // Expect mapped error
            expect(logger.error).toHaveBeenCalled();
        }));
        it('should throw ValidationError for invalid parameters (mapped from InvalidParameterException)', () => __awaiter(void 0, void 0, void 0, function* () {
            const cognitoError = new client_cognito_identity_provider_1.InvalidParameterException({
                message: 'Invalid attribute xyz',
                $metadata: {},
            });
            cognitoMock.on(client_cognito_identity_provider_1.AdminUpdateUserAttributesCommand).rejects(cognitoError);
            const invalidDetails = {
                username: updateDetails.username,
                attributesToUpdate: { 'invalid-attr!': 'test' },
            };
            yield expect(adapter.adminUpdateUserAttributes(invalidDetails))
                .rejects
                .toThrow(BaseError_1.ValidationError); // Expect mapped error
            yield expect(adapter.adminUpdateUserAttributes(invalidDetails))
                .rejects
                .toHaveProperty('message', expect.stringContaining('Invalid parameters. Invalid attribute xyz'));
            expect(logger.error).toHaveBeenCalled();
        }));
        it('should throw BaseError for generic errors during attribute update', () => __awaiter(void 0, void 0, void 0, function* () {
            const genericError = new Error('Update failed');
            cognitoMock.on(client_cognito_identity_provider_1.AdminUpdateUserAttributesCommand).rejects(genericError);
            yield expect(adapter.adminUpdateUserAttributes(updateDetails))
                .rejects
                .toThrow(BaseError_1.BaseError); // Expect mapped base error
            yield expect(adapter.adminUpdateUserAttributes(updateDetails))
                .rejects
                .toHaveProperty('message', expect.stringContaining('adminUpdateUserAttributes failed: Update failed'));
            expect(logger.error).toHaveBeenCalled();
        }));
    });
    // --- Test adminDeleteUser ---
    describe('adminDeleteUser', () => {
        const testUsername = 'user-to-delete@example.com';
        it('should delete user successfully (returns void)', () => __awaiter(void 0, void 0, void 0, function* () {
            // AdminDeleteUser returns {} on success
            cognitoMock.on(client_cognito_identity_provider_1.AdminDeleteUserCommand).resolves({});
            yield expect(adapter.adminDeleteUser(testUsername))
                .resolves
                .toBeUndefined(); // Expect void on success
            expect(cognitoMock).toHaveReceivedCommandWith(client_cognito_identity_provider_1.AdminDeleteUserCommand, {
                UserPoolId: MOCK_USER_POOL_ID,
                Username: testUsername,
            });
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Admin successfully deleted user'));
        }));
        it('should throw UserNotFoundError if user does not exist (mapped from UserNotFoundException)', () => __awaiter(void 0, void 0, void 0, function* () {
            const cognitoError = new client_cognito_identity_provider_1.UserNotFoundException({
                message: 'User not found',
                $metadata: {},
            });
            cognitoMock.on(client_cognito_identity_provider_1.AdminDeleteUserCommand).rejects(cognitoError);
            yield expect(adapter.adminDeleteUser(testUsername))
                .rejects
                .toThrow(UserManagementError_1.UserNotFoundError); // Expect mapped error
            expect(cognitoMock).toHaveReceivedCommandWith(client_cognito_identity_provider_1.AdminDeleteUserCommand, {
                UserPoolId: MOCK_USER_POOL_ID,
                Username: testUsername,
            });
            expect(logger.error).toHaveBeenCalled();
        }));
        it('should throw BaseError for generic errors during user deletion', () => __awaiter(void 0, void 0, void 0, function* () {
            const genericError = new Error('Deletion failed');
            cognitoMock.on(client_cognito_identity_provider_1.AdminDeleteUserCommand).rejects(genericError);
            yield expect(adapter.adminDeleteUser(testUsername))
                .rejects
                .toThrow(BaseError_1.BaseError); // Expect mapped base error
            yield expect(adapter.adminDeleteUser(testUsername))
                .rejects
                .toHaveProperty('message', expect.stringContaining('adminDeleteUser failed: Deletion failed'));
            expect(logger.error).toHaveBeenCalled();
        }));
    });
    // --- Test adminDisableUser ---
    describe('adminDisableUser', () => {
        const testUsername = 'user-to-disable@test.co';
        it('should disable user successfully (returns void)', () => __awaiter(void 0, void 0, void 0, function* () {
            cognitoMock.on(client_cognito_identity_provider_1.AdminDisableUserCommand).resolves({});
            const result = yield adapter.adminDisableUser(testUsername);
            expect(result).toBeUndefined();
            expect(cognitoMock).toHaveReceivedCommandWith(client_cognito_identity_provider_1.AdminDisableUserCommand, {
                UserPoolId: MOCK_USER_POOL_ID,
                Username: testUsername,
            });
            expect(logger.info).toHaveBeenCalledWith(`Admin successfully disabled user: ${testUsername}`);
        }));
        it('should throw UserNotFoundError if user not found', () => __awaiter(void 0, void 0, void 0, function* () {
            const error = new client_cognito_identity_provider_1.UserNotFoundException({ message: "User not found.", $metadata: {} });
            cognitoMock.on(client_cognito_identity_provider_1.AdminDisableUserCommand).rejects(error);
            yield expect(adapter.adminDisableUser(testUsername))
                .rejects.toThrow(UserManagementError_1.UserNotFoundError);
            expect(cognitoMock).toHaveReceivedCommandWith(client_cognito_identity_provider_1.AdminDisableUserCommand, { Username: testUsername });
        }));
        // Add test for other generic errors -> BaseError
    });
    // --- Test adminEnableUser ---
    describe('adminEnableUser', () => {
        const testUsername = 'user-to-enable@test.co';
        it('should enable user successfully (returns void)', () => __awaiter(void 0, void 0, void 0, function* () {
            cognitoMock.on(client_cognito_identity_provider_1.AdminEnableUserCommand).resolves({});
            const result = yield adapter.adminEnableUser(testUsername);
            expect(result).toBeUndefined();
            expect(cognitoMock).toHaveReceivedCommandWith(client_cognito_identity_provider_1.AdminEnableUserCommand, {
                UserPoolId: MOCK_USER_POOL_ID,
                Username: testUsername,
            });
            expect(logger.info).toHaveBeenCalledWith(`Admin successfully enabled user: ${testUsername}`);
        }));
        it('should throw UserNotFoundError if user not found', () => __awaiter(void 0, void 0, void 0, function* () {
            const error = new client_cognito_identity_provider_1.UserNotFoundException({ message: "User not found.", $metadata: {} });
            cognitoMock.on(client_cognito_identity_provider_1.AdminEnableUserCommand).rejects(error);
            yield expect(adapter.adminEnableUser(testUsername))
                .rejects.toThrow(UserManagementError_1.UserNotFoundError);
        }));
        // Add test for other generic errors -> BaseError
    });
    // --- Test adminInitiatePasswordReset ---
    describe('adminInitiatePasswordReset', () => {
        const testUsername = 'user-reset-pass@test.co';
        it('should initiate password reset successfully (returns void)', () => __awaiter(void 0, void 0, void 0, function* () {
            cognitoMock.on(client_cognito_identity_provider_1.AdminResetUserPasswordCommand).resolves({});
            const result = yield adapter.adminInitiatePasswordReset(testUsername);
            expect(result).toBeUndefined();
            expect(cognitoMock).toHaveReceivedCommandWith(client_cognito_identity_provider_1.AdminResetUserPasswordCommand, {
                UserPoolId: MOCK_USER_POOL_ID,
                Username: testUsername,
            });
            expect(logger.info).toHaveBeenCalledWith(`Admin successfully initiated password reset for user: ${testUsername}`);
        }));
        it('should throw UserNotFoundError if user not found', () => __awaiter(void 0, void 0, void 0, function* () {
            const error = new client_cognito_identity_provider_1.UserNotFoundException({ message: "User not found.", $metadata: {} });
            cognitoMock.on(client_cognito_identity_provider_1.AdminResetUserPasswordCommand).rejects(error);
            yield expect(adapter.adminInitiatePasswordReset(testUsername))
                .rejects.toThrow(UserManagementError_1.UserNotFoundError);
        }));
        // Add test for other generic errors -> BaseError
    });
    // --- Test adminSetUserPassword ---
    describe('adminSetUserPassword', () => {
        const testUsername = 'user-set-pass@test.co';
        const password = 'NewPassword123!';
        it('should set user password successfully (permanent=true)', () => __awaiter(void 0, void 0, void 0, function* () {
            cognitoMock.on(client_cognito_identity_provider_1.AdminSetUserPasswordCommand).resolves({});
            const result = yield adapter.adminSetUserPassword(testUsername, password, true);
            expect(result).toBeUndefined();
            expect(cognitoMock).toHaveReceivedCommandWith(client_cognito_identity_provider_1.AdminSetUserPasswordCommand, {
                UserPoolId: MOCK_USER_POOL_ID,
                Username: testUsername,
                Password: password,
                Permanent: true,
            });
            expect(logger.info).toHaveBeenCalledWith(`Admin successfully set password for user: ${testUsername}`);
        }));
        it('should set user password successfully (permanent=false)', () => __awaiter(void 0, void 0, void 0, function* () {
            cognitoMock.on(client_cognito_identity_provider_1.AdminSetUserPasswordCommand).resolves({});
            yield adapter.adminSetUserPassword(testUsername, password, false);
            expect(cognitoMock).toHaveReceivedCommandWith(client_cognito_identity_provider_1.AdminSetUserPasswordCommand, { Permanent: false });
        }));
        it('should throw UserNotFoundError if user not found', () => __awaiter(void 0, void 0, void 0, function* () {
            const error = new client_cognito_identity_provider_1.UserNotFoundException({ message: "User not found.", $metadata: {} });
            cognitoMock.on(client_cognito_identity_provider_1.AdminSetUserPasswordCommand).rejects(error);
            yield expect(adapter.adminSetUserPassword(testUsername, password, true))
                .rejects.toThrow(UserManagementError_1.UserNotFoundError);
        }));
        it('should throw ValidationError for InvalidPasswordException', () => __awaiter(void 0, void 0, void 0, function* () {
            // Mock the specific error message from Cognito
            const cognitoErrorMessage = "Password does not conform.";
            const error = new client_cognito_identity_provider_1.InvalidPasswordException({ message: cognitoErrorMessage, $metadata: {} });
            cognitoMock.on(client_cognito_identity_provider_1.AdminSetUserPasswordCommand).rejects(error);
            // Check it throws the correct mapped error type
            yield expect(adapter.adminSetUserPassword(testUsername, 'bad', true))
                .rejects.toThrow(BaseError_1.ValidationError);
            // FIX: Check the actual generated message, which includes the operation and the Cognito message
            yield expect(adapter.adminSetUserPassword(testUsername, 'bad', true))
                .rejects.toThrow(`Operation: adminSetUserPassword. ${cognitoErrorMessage}`);
            // You could also use a regex that matches the important part:
            // .rejects.toThrow(/Password does not conform/);
        }));
        it('should throw ValidationError for InvalidParameterException', () => __awaiter(void 0, void 0, void 0, function* () {
            const error = new client_cognito_identity_provider_1.InvalidParameterException({ message: "Invalid parameter.", $metadata: {} });
            cognitoMock.on(client_cognito_identity_provider_1.AdminSetUserPasswordCommand).rejects(error);
            yield expect(adapter.adminSetUserPassword(testUsername, password, true))
                .rejects.toThrow(BaseError_1.ValidationError);
            yield expect(adapter.adminSetUserPassword(testUsername, password, true))
                .rejects.toThrow(/Invalid parameters/);
        }));
        // Add test for other generic errors -> BaseError
    });
    // --- Test adminAddUserToGroup ---
    describe('adminAddUserToGroup', () => {
        const testUsername = 'user-add-grp@test.co';
        const testGroupName = 'group-editors';
        it('should add user to group successfully (returns void)', () => __awaiter(void 0, void 0, void 0, function* () {
            cognitoMock.on(client_cognito_identity_provider_1.AdminAddUserToGroupCommand).resolves({});
            const result = yield adapter.adminAddUserToGroup(testUsername, testGroupName);
            expect(result).toBeUndefined();
            expect(cognitoMock).toHaveReceivedCommandWith(client_cognito_identity_provider_1.AdminAddUserToGroupCommand, {
                UserPoolId: MOCK_USER_POOL_ID,
                Username: testUsername,
                GroupName: testGroupName,
            });
            expect(logger.info).toHaveBeenCalledWith(`Admin successfully added user ${testUsername} to group ${testGroupName}`);
        }));
        it('should throw UserNotFoundError if user not found', () => __awaiter(void 0, void 0, void 0, function* () {
            const error = new client_cognito_identity_provider_1.UserNotFoundException({ message: "User not found.", $metadata: {} });
            cognitoMock.on(client_cognito_identity_provider_1.AdminAddUserToGroupCommand).rejects(error);
            yield expect(adapter.adminAddUserToGroup(testUsername, testGroupName))
                .rejects.toThrow(UserManagementError_1.UserNotFoundError);
        }));
        it('should throw NotFoundError if group not found (ResourceNotFoundException)', () => __awaiter(void 0, void 0, void 0, function* () {
            const error = new client_cognito_identity_provider_1.ResourceNotFoundException({ message: "Group not found.", $metadata: {} });
            cognitoMock.on(client_cognito_identity_provider_1.AdminAddUserToGroupCommand).rejects(error);
            yield expect(adapter.adminAddUserToGroup(testUsername, testGroupName))
                .rejects.toThrow(BaseError_1.NotFoundError); // Mapped to generic NotFoundError
            yield expect(adapter.adminAddUserToGroup(testUsername, testGroupName))
                .rejects.toThrow(/Resource \(User or Group\)/);
        }));
        // Note: Cognito doesn't have a standard UserAlreadyInGroupException.
        // This logic is usually handled in the Service layer by checking first,
        // or by catching a generic error if the add fails due to existing membership.
        // Test generic error case:
        it('should throw BaseError for other errors', () => __awaiter(void 0, void 0, void 0, function* () {
            const error = new Error("Some other cognito issue");
            cognitoMock.on(client_cognito_identity_provider_1.AdminAddUserToGroupCommand).rejects(error);
            yield expect(adapter.adminAddUserToGroup(testUsername, testGroupName))
                .rejects.toThrow(BaseError_1.BaseError);
        }));
    });
    // --- Test adminRemoveUserFromGroup ---
    describe('adminRemoveUserFromGroup', () => {
        const testUsername = 'user-rem-grp@test.co';
        const testGroupName = 'group-editors';
        it('should remove user from group successfully (returns void)', () => __awaiter(void 0, void 0, void 0, function* () {
            cognitoMock.on(client_cognito_identity_provider_1.AdminRemoveUserFromGroupCommand).resolves({});
            const result = yield adapter.adminRemoveUserFromGroup(testUsername, testGroupName);
            expect(result).toBeUndefined();
            expect(cognitoMock).toHaveReceivedCommandWith(client_cognito_identity_provider_1.AdminRemoveUserFromGroupCommand, {
                UserPoolId: MOCK_USER_POOL_ID,
                Username: testUsername,
                GroupName: testGroupName,
            });
            expect(logger.info).toHaveBeenCalledWith(`Admin successfully removed user ${testUsername} from group ${testGroupName}`);
        }));
        it('should throw UserNotFoundError if user not found', () => __awaiter(void 0, void 0, void 0, function* () {
            const error = new client_cognito_identity_provider_1.UserNotFoundException({ message: "User not found.", $metadata: {} });
            cognitoMock.on(client_cognito_identity_provider_1.AdminRemoveUserFromGroupCommand).rejects(error);
            yield expect(adapter.adminRemoveUserFromGroup(testUsername, testGroupName))
                .rejects.toThrow(UserManagementError_1.UserNotFoundError);
        }));
        it('should throw NotFoundError if group not found', () => __awaiter(void 0, void 0, void 0, function* () {
            const error = new client_cognito_identity_provider_1.ResourceNotFoundException({ message: "Group not found.", $metadata: {} });
            cognitoMock.on(client_cognito_identity_provider_1.AdminRemoveUserFromGroupCommand).rejects(error);
            yield expect(adapter.adminRemoveUserFromGroup(testUsername, testGroupName))
                .rejects.toThrow(BaseError_1.NotFoundError);
        }));
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
        it('should list groups for a user successfully', () => __awaiter(void 0, void 0, void 0, function* () {
            cognitoMock.on(client_cognito_identity_provider_1.AdminListGroupsForUserCommand).resolves(mockResponse);
            const result = yield adapter.adminListGroupsForUser(testUsername, 10, 'startToken');
            expect(result.groups).toHaveLength(2);
            expect(result.groups[0].GroupName).toBe('group1');
            expect(result.nextToken).toBe('nextPageToken123');
            expect(cognitoMock).toHaveReceivedCommandWith(client_cognito_identity_provider_1.AdminListGroupsForUserCommand, {
                UserPoolId: MOCK_USER_POOL_ID,
                Username: testUsername,
                Limit: 10,
                NextToken: 'startToken',
            });
            expect(logger.debug).toHaveBeenCalledWith(`Admin successfully listed groups for user ${testUsername}`);
        }));
        it('should handle empty group list', () => __awaiter(void 0, void 0, void 0, function* () {
            cognitoMock.on(client_cognito_identity_provider_1.AdminListGroupsForUserCommand).resolves({ Groups: [], NextToken: undefined });
            const result = yield adapter.adminListGroupsForUser(testUsername);
            expect(result.groups).toHaveLength(0);
            expect(result.nextToken).toBeUndefined();
        }));
        it('should throw UserNotFoundError if user not found', () => __awaiter(void 0, void 0, void 0, function* () {
            const error = new client_cognito_identity_provider_1.UserNotFoundException({ message: "User not found.", $metadata: {} });
            cognitoMock.on(client_cognito_identity_provider_1.AdminListGroupsForUserCommand).rejects(error);
            yield expect(adapter.adminListGroupsForUser(testUsername))
                .rejects.toThrow(UserManagementError_1.UserNotFoundError);
        }));
        // Add generic BaseError test
    });
    // --- Test adminListUsers ---
    describe('adminListUsers', () => {
        const options = { limit: 25, paginationToken: 'token1', filter: 'email ^= "test@"' };
        const mockResponse = {
            Users: [
                { Username: 'user1', Attributes: [{ Name: 'email', Value: 'test@1' }] },
                { Username: 'user2', Attributes: [{ Name: 'email', Value: 'test@2' }] },
            ],
            PaginationToken: 'token2',
        };
        it('should list users successfully', () => __awaiter(void 0, void 0, void 0, function* () {
            cognitoMock.on(client_cognito_identity_provider_1.ListUsersCommand).resolves(mockResponse);
            const result = yield adapter.adminListUsers(options);
            expect(result.users).toHaveLength(2);
            expect(result.users[0].Username).toBe('user1');
            expect(result.paginationToken).toBe('token2');
            expect(cognitoMock).toHaveReceivedCommandWith(client_cognito_identity_provider_1.ListUsersCommand, {
                UserPoolId: MOCK_USER_POOL_ID,
                Limit: options.limit,
                PaginationToken: options.paginationToken,
                Filter: options.filter,
            });
            expect(logger.debug).toHaveBeenCalledWith(`Admin successfully listed users`);
        }));
        it('should handle empty user list', () => __awaiter(void 0, void 0, void 0, function* () {
            cognitoMock.on(client_cognito_identity_provider_1.ListUsersCommand).resolves({ Users: [], PaginationToken: undefined });
            const result = yield adapter.adminListUsers({});
            expect(result.users).toHaveLength(0);
            expect(result.paginationToken).toBeUndefined();
        }));
        it('should throw BaseError for InvalidParameterException (e.g., bad filter)', () => __awaiter(void 0, void 0, void 0, function* () {
            const error = new client_cognito_identity_provider_1.InvalidParameterException({ message: "Invalid filter.", $metadata: {} });
            cognitoMock.on(client_cognito_identity_provider_1.ListUsersCommand).rejects(error);
            yield expect(adapter.adminListUsers(options))
                .rejects.toThrow(BaseError_1.ValidationError); // Mapped to ValidationError
            yield expect(adapter.adminListUsers(options))
                .rejects.toThrow(/Invalid parameters/);
        }));
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
        it('should list users in a group successfully', () => __awaiter(void 0, void 0, void 0, function* () {
            cognitoMock.on(client_cognito_identity_provider_1.ListUsersInGroupCommand).resolves(mockResponse);
            const result = yield adapter.adminListUsersInGroup(testGroupName, 5, 'startGroupToken');
            expect(result.users).toHaveLength(2);
            expect(result.users[0].Username).toBe('userA');
            expect(result.nextToken).toBe('nextGroupToken');
            expect(cognitoMock).toHaveReceivedCommandWith(client_cognito_identity_provider_1.ListUsersInGroupCommand, {
                UserPoolId: MOCK_USER_POOL_ID,
                GroupName: testGroupName,
                Limit: 5,
                NextToken: 'startGroupToken',
            });
            expect(logger.debug).toHaveBeenCalledWith(`Admin successfully listed users in group ${testGroupName}`);
        }));
        it('should throw NotFoundError if group not found', () => __awaiter(void 0, void 0, void 0, function* () {
            const error = new client_cognito_identity_provider_1.ResourceNotFoundException({ message: "Group not found.", $metadata: {} });
            cognitoMock.on(client_cognito_identity_provider_1.ListUsersInGroupCommand).rejects(error);
            yield expect(adapter.adminListUsersInGroup(testGroupName))
                .rejects.toThrow(BaseError_1.NotFoundError);
        }));
        // Add empty list test
        // Add generic BaseError test
    });
    // --- Test adminCreateGroup ---
    describe('adminCreateGroup', () => {
        const details = { groupName: 'new-group-test', description: 'A test group' };
        const mockResponse = {
            Group: { GroupName: details.groupName, Description: details.description, UserPoolId: MOCK_USER_POOL_ID }
        };
        it('should create group successfully', () => __awaiter(void 0, void 0, void 0, function* () {
            cognitoMock.on(client_cognito_identity_provider_1.CreateGroupCommand).resolves(mockResponse);
            const result = yield adapter.adminCreateGroup(details);
            expect(result).toEqual(mockResponse.Group);
            expect(cognitoMock).toHaveReceivedCommandWith(client_cognito_identity_provider_1.CreateGroupCommand, {
                UserPoolId: MOCK_USER_POOL_ID,
                GroupName: details.groupName,
                Description: details.description,
                Precedence: undefined, // Assuming not provided
            });
            expect(logger.info).toHaveBeenCalledWith(`Admin successfully created group: ${details.groupName}`);
        }));
        it('should throw GroupExistsError if group already exists', () => __awaiter(void 0, void 0, void 0, function* () {
            const error = new client_cognito_identity_provider_1.GroupExistsException({ message: "Group exists.", $metadata: {} });
            cognitoMock.on(client_cognito_identity_provider_1.CreateGroupCommand).rejects(error);
            yield expect(adapter.adminCreateGroup(details))
                .rejects.toThrow(UserManagementError_1.GroupExistsError);
        }));
        // Add generic BaseError test
    });
    // --- Test adminDeleteGroup ---
    describe('adminDeleteGroup', () => {
        const testGroupName = 'group-to-delete';
        it('should delete group successfully (returns void)', () => __awaiter(void 0, void 0, void 0, function* () {
            cognitoMock.on(client_cognito_identity_provider_1.DeleteGroupCommand).resolves({});
            const result = yield adapter.adminDeleteGroup(testGroupName);
            expect(result).toBeUndefined();
            expect(cognitoMock).toHaveReceivedCommandWith(client_cognito_identity_provider_1.DeleteGroupCommand, {
                UserPoolId: MOCK_USER_POOL_ID,
                GroupName: testGroupName,
            });
            expect(logger.info).toHaveBeenCalledWith(`Admin successfully deleted group: ${testGroupName}`);
        }));
        it('should throw NotFoundError if group not found', () => __awaiter(void 0, void 0, void 0, function* () {
            const error = new client_cognito_identity_provider_1.ResourceNotFoundException({ message: "Group not found.", $metadata: {} });
            cognitoMock.on(client_cognito_identity_provider_1.DeleteGroupCommand).rejects(error);
            yield expect(adapter.adminDeleteGroup(testGroupName))
                .rejects.toThrow(BaseError_1.NotFoundError);
        }));
        // Add generic BaseError test
    });
    // --- Test adminGetGroup ---
    describe('adminGetGroup', () => {
        const testGroupName = 'group-to-get';
        const mockResponse = {
            Group: { GroupName: testGroupName, Description: 'Details', UserPoolId: MOCK_USER_POOL_ID }
        };
        it('should get group successfully', () => __awaiter(void 0, void 0, void 0, function* () {
            cognitoMock.on(client_cognito_identity_provider_1.GetGroupCommand).resolves(mockResponse);
            const result = yield adapter.adminGetGroup(testGroupName);
            expect(result).toEqual(mockResponse.Group);
            expect(cognitoMock).toHaveReceivedCommandWith(client_cognito_identity_provider_1.GetGroupCommand, {
                UserPoolId: MOCK_USER_POOL_ID,
                GroupName: testGroupName,
            });
            expect(logger.debug).toHaveBeenCalledWith(`Admin successfully retrieved group: ${testGroupName}`);
        }));
        it('should return null if group not found', () => __awaiter(void 0, void 0, void 0, function* () {
            const error = new client_cognito_identity_provider_1.ResourceNotFoundException({ message: "Group not found.", $metadata: {} });
            cognitoMock.on(client_cognito_identity_provider_1.GetGroupCommand).rejects(error);
            const result = yield adapter.adminGetGroup(testGroupName);
            expect(result).toBeNull();
            expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining(`Group not found: ${testGroupName}`));
        }));
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
        it('should list groups successfully', () => __awaiter(void 0, void 0, void 0, function* () {
            cognitoMock.on(client_cognito_identity_provider_1.ListGroupsCommand).resolves(mockResponse);
            const result = yield adapter.adminListGroups(15, 'startToken');
            expect(result.groups).toHaveLength(2);
            expect(result.groups[0].GroupName).toBe('grp1');
            expect(result.nextToken).toBe('listGroupsToken');
            expect(cognitoMock).toHaveReceivedCommandWith(client_cognito_identity_provider_1.ListGroupsCommand, {
                UserPoolId: MOCK_USER_POOL_ID,
                Limit: 15,
                NextToken: 'startToken',
            });
            expect(logger.debug).toHaveBeenCalledWith(`Admin successfully listed groups`);
        }));
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
