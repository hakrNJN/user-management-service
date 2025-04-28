import { UserType } from '@aws-sdk/client-cognito-identity-provider'; // Assuming adapter uses this
import { mock, MockProxy } from 'jest-mock-extended';
import { ILogger } from '../../../../src/application/interfaces/ILogger';
import { AdminCreateUserDetails, AdminUpdateUserAttributesDetails, IUserMgmtAdapter, ListUsersOptions } from '../../../../src/application/interfaces/IUserMgmtAdapter';
import { UserAdminService } from '../../../../src/application/services/user.admin.service';
import { AdminUserView } from '../../../../src/domain/entities/AdminUserView';
import { BaseError, NotFoundError, ValidationError } from '../../../../src/shared/errors/BaseError';
import { AdminUser } from '../../../../src/shared/types/admin-user.interface';

// --- Test Suite ---
describe('UserAdminService', () => {
    let service: UserAdminService;
    let mockUserMgmtAdapter: MockProxy<IUserMgmtAdapter>;
    let mockLogger: MockProxy<ILogger>;

    // Mock data
    const MOCK_ADMIN_USER: AdminUser = {
        id: 'admin-user-id',
        username: 'test-admin',
        roles: ['admin'], // Crucial for permission checks
    };
    const MOCK_TARGET_USERNAME = 'target-user';
    const MOCK_COGNITO_USER: UserType = { // Example structure, adjust based on actual UserType
        Username: MOCK_TARGET_USERNAME,
        Attributes: [
            { Name: 'sub', Value: 'target-user-sub-id' },
            { Name: 'email', Value: 'target@example.com' },
            { Name: 'given_name', Value: 'Target' },
            { Name: 'family_name', Value: 'User' },
        ],
        UserCreateDate: new Date(),
        UserLastModifiedDate: new Date(),
        Enabled: true,
        UserStatus: 'CONFIRMED',
    };
    const MOCK_ADMIN_USER_VIEW = AdminUserView.fromCognitoUser(MOCK_COGNITO_USER); // Use the actual mapping

    const MOCK_CREATE_DETAILS: AdminCreateUserDetails = {
        username: 'new-user@example.com',
        temporaryPassword: 'TempPassword123!',
        userAttributes: {
            email: 'new-user@example.com',
            given_name: 'New',
            family_name: 'User',
            email_verified: 'true', // Often required
        },
    };
    const MOCK_UPDATE_DETAILS: AdminUpdateUserAttributesDetails = {
        username: MOCK_TARGET_USERNAME,
        attributesToUpdate: {
            given_name: 'UpdatedFirst',
            family_name: 'UpdatedLast',
        },
    };

    beforeEach(() => {
        // Create fresh mocks for each test
        mockUserMgmtAdapter = mock<IUserMgmtAdapter>();
        mockLogger = mock<ILogger>(); // Mock logger to suppress actual logging during tests

        // Instantiate the service with mocks
        service = new UserAdminService(mockUserMgmtAdapter, mockLogger);

        // Optional: Add default mock implementations if needed across many tests
        // e.g., mockUserMgmtAdapter.adminGetUser.mockResolvedValue(MOCK_COGNITO_USER);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    // --- Test createUser ---
    describe('createUser', () => {
        it('should call adapter.adminCreateUser and return mapped AdminUserView', async () => {
            // Arrange
            const createdCognitoUser = { ...MOCK_COGNITO_USER, Username: MOCK_CREATE_DETAILS.username };
            mockUserMgmtAdapter.adminCreateUser.mockResolvedValue(createdCognitoUser);
            const expectedView = AdminUserView.fromCognitoUser(createdCognitoUser);

            // Act
            const result = await service.createUser(MOCK_ADMIN_USER, MOCK_CREATE_DETAILS);

            // Assert
            expect(mockUserMgmtAdapter.adminCreateUser).toHaveBeenCalledWith(MOCK_CREATE_DETAILS);
            expect(result).toEqual(expectedView);
            expect(mockLogger.info).toHaveBeenCalled(); // Check logging
        });

        it('should re-throw error from adapter', async () => {
            // Arrange
            const adapterError = new BaseError('AdapterError', 500, 'Cognito failed', true);
            mockUserMgmtAdapter.adminCreateUser.mockRejectedValue(adapterError);

            // Act & Assert
            await expect(service.createUser(MOCK_ADMIN_USER, MOCK_CREATE_DETAILS))
                .rejects.toThrow(adapterError);
            expect(mockUserMgmtAdapter.adminCreateUser).toHaveBeenCalledWith(MOCK_CREATE_DETAILS);
            expect(mockLogger.error).toHaveBeenCalled(); // Check error logging
        });

        it('should throw ForbiddenError if admin lacks permission', async () => {
            // Arrange
            const nonAdminUser: AdminUser = { ...MOCK_ADMIN_USER, roles: ['user'] };

            // Act & Assert
            await expect(service.createUser(nonAdminUser, MOCK_CREATE_DETAILS))
                .rejects.toThrow(BaseError); // Check for BaseError with 403 status
             await expect(service.createUser(nonAdminUser, MOCK_CREATE_DETAILS))
                .rejects.toHaveProperty('statusCode', 403);
            expect(mockUserMgmtAdapter.adminCreateUser).not.toHaveBeenCalled();
            expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('permission check failed'), expect.any(Object));
        });
    });

    // --- Test getUser ---
    describe('getUser', () => {
        it('should call adapter.adminGetUser, adapter.adminListGroupsForUser and return mapped AdminUserView if found', async () => {
            // Arrange
            mockUserMgmtAdapter.adminGetUser.mockResolvedValue(MOCK_COGNITO_USER);
            mockUserMgmtAdapter.adminListGroupsForUser.mockResolvedValue({ groups: [{ GroupName: 'group1' }], nextToken: undefined }); // Mock group fetch
            const expectedView = AdminUserView.fromCognitoUser(MOCK_COGNITO_USER, ['group1']);

            // Act
            const result = await service.getUser(MOCK_ADMIN_USER, MOCK_TARGET_USERNAME);

            // Assert
            expect(mockUserMgmtAdapter.adminGetUser).toHaveBeenCalledWith(MOCK_TARGET_USERNAME);
            expect(mockUserMgmtAdapter.adminListGroupsForUser).toHaveBeenCalledWith(MOCK_TARGET_USERNAME);
            expect(result).toEqual(expectedView);
            expect(mockLogger.info).toHaveBeenCalled();
        });

        it('should return null if adapter.adminGetUser returns null', async () => {
            // Arrange
            mockUserMgmtAdapter.adminGetUser.mockResolvedValue(null);

            // Act
            const result = await service.getUser(MOCK_ADMIN_USER, MOCK_TARGET_USERNAME);

            // Assert
            expect(result).toBeNull();
            expect(mockUserMgmtAdapter.adminGetUser).toHaveBeenCalledWith(MOCK_TARGET_USERNAME);
            expect(mockUserMgmtAdapter.adminListGroupsForUser).not.toHaveBeenCalled(); // Shouldn't fetch groups if user not found
            expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('User not found'), expect.any(Object));
        });

        it('should return null if adapter.adminGetUser throws NotFoundError', async () => {
            // Arrange
            const adapterError = new NotFoundError(`User ${MOCK_TARGET_USERNAME} not found`);
            mockUserMgmtAdapter.adminGetUser.mockRejectedValue(adapterError);

            // Act
            const result = await service.getUser(MOCK_ADMIN_USER, MOCK_TARGET_USERNAME);

            // Assert
            expect(result).toBeNull();
            expect(mockUserMgmtAdapter.adminGetUser).toHaveBeenCalledWith(MOCK_TARGET_USERNAME);
            expect(mockLogger.error).toHaveBeenCalled(); // Error is logged
        });

        it('should re-throw other errors from adapter.adminGetUser', async () => {
            // Arrange
            const adapterError = new BaseError('SomeError', 500, 'Something else failed', true);
            mockUserMgmtAdapter.adminGetUser.mockRejectedValue(adapterError);

            // Act & Assert
            await expect(service.getUser(MOCK_ADMIN_USER, MOCK_TARGET_USERNAME))
                .rejects.toThrow(adapterError);
            expect(mockLogger.error).toHaveBeenCalled();
        });

         it('should throw ForbiddenError if admin lacks permission', async () => {
            // Arrange
            const nonAdminUser: AdminUser = { ...MOCK_ADMIN_USER, roles: ['user'] };

            // Act & Assert
            await expect(service.getUser(nonAdminUser, MOCK_TARGET_USERNAME))
                .rejects.toHaveProperty('statusCode', 403);
            expect(mockUserMgmtAdapter.adminGetUser).not.toHaveBeenCalled();
        });
    });

    // --- Test listUsers ---
    describe('listUsers', () => {
        it('should call adapter.adminListUsers and return mapped users and token', async () => {
            // Arrange
            const options: ListUsersOptions = { limit: 10, paginationToken: undefined };
            const adapterResult = {
                users: [MOCK_COGNITO_USER],
                paginationToken: 'next-token-123',
            };
            mockUserMgmtAdapter.adminListUsers.mockResolvedValue(adapterResult);
            const expectedViews = [AdminUserView.fromCognitoUser(MOCK_COGNITO_USER)];

            // Act
            const result = await service.listUsers(MOCK_ADMIN_USER, options);

            // Assert
            expect(mockUserMgmtAdapter.adminListUsers).toHaveBeenCalledWith(options);
            expect(result.users).toEqual(expectedViews);
            expect(result.paginationToken).toBe(adapterResult.paginationToken);
            expect(mockLogger.info).toHaveBeenCalled();
        });

        it('should return empty array if adapter returns empty', async () => {
            // Arrange
             const options: ListUsersOptions = {};
             const adapterResult = { users: [], paginationToken: undefined };
             mockUserMgmtAdapter.adminListUsers.mockResolvedValue(adapterResult);

             // Act
             const result = await service.listUsers(MOCK_ADMIN_USER, options);

             // Assert
             expect(result.users).toEqual([]);
             expect(result.paginationToken).toBeUndefined();
             expect(mockUserMgmtAdapter.adminListUsers).toHaveBeenCalledWith(options);
        });

        it('should re-throw error from adapter', async () => {
            // Arrange
            const options: ListUsersOptions = {};
            const adapterError = new BaseError('AdapterError', 500, 'List failed', true);
            mockUserMgmtAdapter.adminListUsers.mockRejectedValue(adapterError);

            // Act & Assert
            await expect(service.listUsers(MOCK_ADMIN_USER, options))
                .rejects.toThrow(adapterError);
            expect(mockLogger.error).toHaveBeenCalled();
        });

         it('should throw ForbiddenError if admin lacks permission', async () => {
            // Arrange
            const nonAdminUser: AdminUser = { ...MOCK_ADMIN_USER, roles: ['user'] };
            const options: ListUsersOptions = {};

            // Act & Assert
            await expect(service.listUsers(nonAdminUser, options))
                .rejects.toHaveProperty('statusCode', 403);
            expect(mockUserMgmtAdapter.adminListUsers).not.toHaveBeenCalled();
        });
    });

    // --- Test updateUserAttributes ---
    describe('updateUserAttributes', () => {
        it('should call adapter.adminUpdateUserAttributes', async () => {
            // Arrange
            mockUserMgmtAdapter.adminUpdateUserAttributes.mockResolvedValue(undefined); // Returns void

            // Act
            await service.updateUserAttributes(MOCK_ADMIN_USER, MOCK_UPDATE_DETAILS);

            // Assert
            expect(mockUserMgmtAdapter.adminUpdateUserAttributes).toHaveBeenCalledWith(MOCK_UPDATE_DETAILS);
            expect(mockLogger.info).toHaveBeenCalled();
        });

        it('should re-throw error from adapter', async () => {
            // Arrange
            const adapterError = new NotFoundError('User not found'); // Example error
            mockUserMgmtAdapter.adminUpdateUserAttributes.mockRejectedValue(adapterError);

            // Act & Assert
            await expect(service.updateUserAttributes(MOCK_ADMIN_USER, MOCK_UPDATE_DETAILS))
                .rejects.toThrow(adapterError);
            expect(mockLogger.error).toHaveBeenCalled();
        });

         it('should throw ForbiddenError if admin lacks permission', async () => {
            // Arrange
            const nonAdminUser: AdminUser = { ...MOCK_ADMIN_USER, roles: ['user'] };

            // Act & Assert
            await expect(service.updateUserAttributes(nonAdminUser, MOCK_UPDATE_DETAILS))
                .rejects.toHaveProperty('statusCode', 403);
            expect(mockUserMgmtAdapter.adminUpdateUserAttributes).not.toHaveBeenCalled();
        });
    });

    // --- Test deleteUser ---
    describe('deleteUser', () => {
        it('should call adapter.adminDeleteUser', async () => {
            // Arrange
            mockUserMgmtAdapter.adminDeleteUser.mockResolvedValue(undefined); // Returns void

            // Act
            await service.deleteUser(MOCK_ADMIN_USER, MOCK_TARGET_USERNAME);

            // Assert
            expect(mockUserMgmtAdapter.adminDeleteUser).toHaveBeenCalledWith(MOCK_TARGET_USERNAME);
            expect(mockLogger.info).toHaveBeenCalled();
        });

        it('should throw ValidationError if admin tries to delete self', async () => {
            // Arrange
            const selfAdmin: AdminUser = { ...MOCK_ADMIN_USER, username: MOCK_TARGET_USERNAME };

            // Act & Assert
            await expect(service.deleteUser(selfAdmin, MOCK_TARGET_USERNAME))
                .rejects.toThrow(ValidationError);
             await expect(service.deleteUser(selfAdmin, MOCK_TARGET_USERNAME))
                .rejects.toThrow('Cannot delete your own admin account.');
            expect(mockUserMgmtAdapter.adminDeleteUser).not.toHaveBeenCalled();
        });

        it('should re-throw error from adapter', async () => {
            // Arrange
            const adapterError = new NotFoundError('User not found'); // Example error
            mockUserMgmtAdapter.adminDeleteUser.mockRejectedValue(adapterError);

            // Act & Assert
            await expect(service.deleteUser(MOCK_ADMIN_USER, MOCK_TARGET_USERNAME))
                .rejects.toThrow(adapterError);
            expect(mockLogger.error).toHaveBeenCalled();
        });

         it('should throw ForbiddenError if admin lacks permission', async () => {
            // Arrange
            const nonAdminUser: AdminUser = { ...MOCK_ADMIN_USER, roles: ['user'] };

            // Act & Assert
            await expect(service.deleteUser(nonAdminUser, MOCK_TARGET_USERNAME))
                .rejects.toHaveProperty('statusCode', 403);
            expect(mockUserMgmtAdapter.adminDeleteUser).not.toHaveBeenCalled();
        });
    });

    // Add similar tests for other methods:
    // - disableUser
    // - enableUser
    // - initiatePasswordReset
    // - setUserPassword
    // - addUserToGroup
    // - removeUserFromGroup
    // - listGroupsForUser
    // - listUsersInGroup
    // Remember to test success cases, expected error cases (like NotFoundError, ValidationError),
    // adapter errors being re-thrown, and permission checks.
});
