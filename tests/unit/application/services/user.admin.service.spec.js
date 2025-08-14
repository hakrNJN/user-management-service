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
const jest_mock_extended_1 = require("jest-mock-extended");
const user_admin_service_1 = require("../../../../src/application/services/user.admin.service");
const AdminUserView_1 = require("../../../../src/domain/entities/AdminUserView");
const BaseError_1 = require("../../../../src/shared/errors/BaseError");
// --- Test Suite ---
describe('UserAdminService', () => {
    let service;
    let mockUserMgmtAdapter;
    let mockLogger;
    // Mock data
    const MOCK_ADMIN_USER = {
        id: 'admin-user-id',
        username: 'test-admin',
        roles: ['admin'], // Crucial for permission checks
    };
    const MOCK_TARGET_USERNAME = 'target-user';
    const MOCK_COGNITO_USER = {
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
    const MOCK_ADMIN_USER_VIEW = AdminUserView_1.AdminUserView.fromCognitoUser(MOCK_COGNITO_USER); // Use the actual mapping
    const MOCK_CREATE_DETAILS = {
        username: 'new-user@example.com',
        temporaryPassword: 'TempPassword123!',
        userAttributes: {
            email: 'new-user@example.com',
            given_name: 'New',
            family_name: 'User',
            email_verified: 'true', // Often required
        },
    };
    const MOCK_UPDATE_DETAILS = {
        username: MOCK_TARGET_USERNAME,
        attributesToUpdate: {
            given_name: 'UpdatedFirst',
            family_name: 'UpdatedLast',
        },
    };
    beforeEach(() => {
        // Create fresh mocks for each test
        mockUserMgmtAdapter = (0, jest_mock_extended_1.mock)();
        mockLogger = (0, jest_mock_extended_1.mock)(); // Mock logger to suppress actual logging during tests
        // Instantiate the service with mocks
        service = new user_admin_service_1.UserAdminService(mockUserMgmtAdapter, mockLogger);
        // Optional: Add default mock implementations if needed across many tests
        // e.g., mockUserMgmtAdapter.adminGetUser.mockResolvedValue(MOCK_COGNITO_USER);
    });
    it('should be defined', () => {
        expect(service).toBeDefined();
    });
    // --- Test createUser ---
    describe('createUser', () => {
        it('should call adapter.adminCreateUser and return mapped AdminUserView', () => __awaiter(void 0, void 0, void 0, function* () {
            // Arrange
            const createdCognitoUser = Object.assign(Object.assign({}, MOCK_COGNITO_USER), { Username: MOCK_CREATE_DETAILS.username });
            mockUserMgmtAdapter.adminCreateUser.mockResolvedValue(createdCognitoUser);
            const expectedView = AdminUserView_1.AdminUserView.fromCognitoUser(createdCognitoUser);
            // Act
            const result = yield service.createUser(MOCK_ADMIN_USER, MOCK_CREATE_DETAILS);
            // Assert
            expect(mockUserMgmtAdapter.adminCreateUser).toHaveBeenCalledWith(MOCK_CREATE_DETAILS);
            expect(result).toEqual(expectedView);
            expect(mockLogger.info).toHaveBeenCalled(); // Check logging
        }));
        it('should re-throw error from adapter', () => __awaiter(void 0, void 0, void 0, function* () {
            // Arrange
            const adapterError = new BaseError_1.BaseError('AdapterError', 500, 'Cognito failed', true);
            mockUserMgmtAdapter.adminCreateUser.mockRejectedValue(adapterError);
            // Act & Assert
            yield expect(service.createUser(MOCK_ADMIN_USER, MOCK_CREATE_DETAILS))
                .rejects.toThrow(adapterError);
            expect(mockUserMgmtAdapter.adminCreateUser).toHaveBeenCalledWith(MOCK_CREATE_DETAILS);
            expect(mockLogger.error).toHaveBeenCalled(); // Check error logging
        }));
        it('should throw ForbiddenError if admin lacks permission', () => __awaiter(void 0, void 0, void 0, function* () {
            // Arrange
            const nonAdminUser = Object.assign(Object.assign({}, MOCK_ADMIN_USER), { roles: ['user'] });
            // Act & Assert
            yield expect(service.createUser(nonAdminUser, MOCK_CREATE_DETAILS))
                .rejects.toThrow(BaseError_1.BaseError); // Check for BaseError with 403 status
            yield expect(service.createUser(nonAdminUser, MOCK_CREATE_DETAILS))
                .rejects.toHaveProperty('statusCode', 403);
            expect(mockUserMgmtAdapter.adminCreateUser).not.toHaveBeenCalled();
            expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('permission check failed'), expect.any(Object));
        }));
    });
    // --- Test getUser ---
    describe('getUser', () => {
        it('should call adapter.adminGetUser, adapter.adminListGroupsForUser and return mapped AdminUserView if found', () => __awaiter(void 0, void 0, void 0, function* () {
            // Arrange
            mockUserMgmtAdapter.adminGetUser.mockResolvedValue(MOCK_COGNITO_USER);
            mockUserMgmtAdapter.adminListGroupsForUser.mockResolvedValue({ groups: [{ GroupName: 'group1' }], nextToken: undefined }); // Mock group fetch
            const expectedView = AdminUserView_1.AdminUserView.fromCognitoUser(MOCK_COGNITO_USER, ['group1']);
            // Act
            const result = yield service.getUser(MOCK_ADMIN_USER, MOCK_TARGET_USERNAME);
            // Assert
            expect(mockUserMgmtAdapter.adminGetUser).toHaveBeenCalledWith(MOCK_TARGET_USERNAME);
            expect(mockUserMgmtAdapter.adminListGroupsForUser).toHaveBeenCalledWith(MOCK_TARGET_USERNAME);
            expect(result).toEqual(expectedView);
            expect(mockLogger.info).toHaveBeenCalled();
        }));
        it('should return null if adapter.adminGetUser returns null', () => __awaiter(void 0, void 0, void 0, function* () {
            // Arrange
            mockUserMgmtAdapter.adminGetUser.mockResolvedValue(null);
            // Act
            const result = yield service.getUser(MOCK_ADMIN_USER, MOCK_TARGET_USERNAME);
            // Assert
            expect(result).toBeNull();
            expect(mockUserMgmtAdapter.adminGetUser).toHaveBeenCalledWith(MOCK_TARGET_USERNAME);
            expect(mockUserMgmtAdapter.adminListGroupsForUser).not.toHaveBeenCalled(); // Shouldn't fetch groups if user not found
            expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('User not found'), expect.any(Object));
        }));
        it('should return null if adapter.adminGetUser throws NotFoundError', () => __awaiter(void 0, void 0, void 0, function* () {
            // Arrange
            const adapterError = new BaseError_1.NotFoundError(`User ${MOCK_TARGET_USERNAME} not found`);
            mockUserMgmtAdapter.adminGetUser.mockRejectedValue(adapterError);
            // Act
            const result = yield service.getUser(MOCK_ADMIN_USER, MOCK_TARGET_USERNAME);
            // Assert
            expect(result).toBeNull();
            expect(mockUserMgmtAdapter.adminGetUser).toHaveBeenCalledWith(MOCK_TARGET_USERNAME);
            expect(mockLogger.error).toHaveBeenCalled(); // Error is logged
        }));
        it('should re-throw other errors from adapter.adminGetUser', () => __awaiter(void 0, void 0, void 0, function* () {
            // Arrange
            const adapterError = new BaseError_1.BaseError('SomeError', 500, 'Something else failed', true);
            mockUserMgmtAdapter.adminGetUser.mockRejectedValue(adapterError);
            // Act & Assert
            yield expect(service.getUser(MOCK_ADMIN_USER, MOCK_TARGET_USERNAME))
                .rejects.toThrow(adapterError);
            expect(mockLogger.error).toHaveBeenCalled();
        }));
        it('should throw ForbiddenError if admin lacks permission', () => __awaiter(void 0, void 0, void 0, function* () {
            // Arrange
            const nonAdminUser = Object.assign(Object.assign({}, MOCK_ADMIN_USER), { roles: ['user'] });
            // Act & Assert
            yield expect(service.getUser(nonAdminUser, MOCK_TARGET_USERNAME))
                .rejects.toHaveProperty('statusCode', 403);
            expect(mockUserMgmtAdapter.adminGetUser).not.toHaveBeenCalled();
        }));
    });
    // --- Test listUsers ---
    describe('listUsers', () => {
        it('should call adapter.adminListUsers and return mapped users and token', () => __awaiter(void 0, void 0, void 0, function* () {
            // Arrange
            const options = { limit: 10, paginationToken: undefined };
            const adapterResult = {
                users: [MOCK_COGNITO_USER],
                paginationToken: 'next-token-123',
            };
            mockUserMgmtAdapter.adminListUsers.mockResolvedValue(adapterResult);
            const expectedViews = [AdminUserView_1.AdminUserView.fromCognitoUser(MOCK_COGNITO_USER)];
            // Act
            const result = yield service.listUsers(MOCK_ADMIN_USER, options);
            // Assert
            expect(mockUserMgmtAdapter.adminListUsers).toHaveBeenCalledWith(options);
            expect(result.users).toEqual(expectedViews);
            expect(result.paginationToken).toBe(adapterResult.paginationToken);
            expect(mockLogger.info).toHaveBeenCalled();
        }));
        it('should return empty array if adapter returns empty', () => __awaiter(void 0, void 0, void 0, function* () {
            // Arrange
            const options = {};
            const adapterResult = { users: [], paginationToken: undefined };
            mockUserMgmtAdapter.adminListUsers.mockResolvedValue(adapterResult);
            // Act
            const result = yield service.listUsers(MOCK_ADMIN_USER, options);
            // Assert
            expect(result.users).toEqual([]);
            expect(result.paginationToken).toBeUndefined();
            expect(mockUserMgmtAdapter.adminListUsers).toHaveBeenCalledWith(options);
        }));
        it('should re-throw error from adapter', () => __awaiter(void 0, void 0, void 0, function* () {
            // Arrange
            const options = {};
            const adapterError = new BaseError_1.BaseError('AdapterError', 500, 'List failed', true);
            mockUserMgmtAdapter.adminListUsers.mockRejectedValue(adapterError);
            // Act & Assert
            yield expect(service.listUsers(MOCK_ADMIN_USER, options))
                .rejects.toThrow(adapterError);
            expect(mockLogger.error).toHaveBeenCalled();
        }));
        it('should throw ForbiddenError if admin lacks permission', () => __awaiter(void 0, void 0, void 0, function* () {
            // Arrange
            const nonAdminUser = Object.assign(Object.assign({}, MOCK_ADMIN_USER), { roles: ['user'] });
            const options = {};
            // Act & Assert
            yield expect(service.listUsers(nonAdminUser, options))
                .rejects.toHaveProperty('statusCode', 403);
            expect(mockUserMgmtAdapter.adminListUsers).not.toHaveBeenCalled();
        }));
    });
    // --- Test updateUserAttributes ---
    describe('updateUserAttributes', () => {
        it('should call adapter.adminUpdateUserAttributes', () => __awaiter(void 0, void 0, void 0, function* () {
            // Arrange
            mockUserMgmtAdapter.adminUpdateUserAttributes.mockResolvedValue(undefined); // Returns void
            // Act
            yield service.updateUserAttributes(MOCK_ADMIN_USER, MOCK_UPDATE_DETAILS);
            // Assert
            expect(mockUserMgmtAdapter.adminUpdateUserAttributes).toHaveBeenCalledWith(MOCK_UPDATE_DETAILS);
            expect(mockLogger.info).toHaveBeenCalled();
        }));
        it('should re-throw error from adapter', () => __awaiter(void 0, void 0, void 0, function* () {
            // Arrange
            const adapterError = new BaseError_1.NotFoundError('User not found'); // Example error
            mockUserMgmtAdapter.adminUpdateUserAttributes.mockRejectedValue(adapterError);
            // Act & Assert
            yield expect(service.updateUserAttributes(MOCK_ADMIN_USER, MOCK_UPDATE_DETAILS))
                .rejects.toThrow(adapterError);
            expect(mockLogger.error).toHaveBeenCalled();
        }));
        it('should throw ForbiddenError if admin lacks permission', () => __awaiter(void 0, void 0, void 0, function* () {
            // Arrange
            const nonAdminUser = Object.assign(Object.assign({}, MOCK_ADMIN_USER), { roles: ['user'] });
            // Act & Assert
            yield expect(service.updateUserAttributes(nonAdminUser, MOCK_UPDATE_DETAILS))
                .rejects.toHaveProperty('statusCode', 403);
            expect(mockUserMgmtAdapter.adminUpdateUserAttributes).not.toHaveBeenCalled();
        }));
    });
    // --- Test deleteUser ---
    describe('deleteUser', () => {
        it('should call adapter.adminDeleteUser', () => __awaiter(void 0, void 0, void 0, function* () {
            // Arrange
            mockUserMgmtAdapter.adminDeleteUser.mockResolvedValue(undefined); // Returns void
            // Act
            yield service.deleteUser(MOCK_ADMIN_USER, MOCK_TARGET_USERNAME);
            // Assert
            expect(mockUserMgmtAdapter.adminDeleteUser).toHaveBeenCalledWith(MOCK_TARGET_USERNAME);
            expect(mockLogger.info).toHaveBeenCalled();
        }));
        it('should throw ValidationError if admin tries to delete self', () => __awaiter(void 0, void 0, void 0, function* () {
            // Arrange
            const selfAdmin = Object.assign(Object.assign({}, MOCK_ADMIN_USER), { username: MOCK_TARGET_USERNAME });
            // Act & Assert
            yield expect(service.deleteUser(selfAdmin, MOCK_TARGET_USERNAME))
                .rejects.toThrow(BaseError_1.ValidationError);
            yield expect(service.deleteUser(selfAdmin, MOCK_TARGET_USERNAME))
                .rejects.toThrow('Cannot delete your own admin account.');
            expect(mockUserMgmtAdapter.adminDeleteUser).not.toHaveBeenCalled();
        }));
        it('should re-throw error from adapter', () => __awaiter(void 0, void 0, void 0, function* () {
            // Arrange
            const adapterError = new BaseError_1.NotFoundError('User not found'); // Example error
            mockUserMgmtAdapter.adminDeleteUser.mockRejectedValue(adapterError);
            // Act & Assert
            yield expect(service.deleteUser(MOCK_ADMIN_USER, MOCK_TARGET_USERNAME))
                .rejects.toThrow(adapterError);
            expect(mockLogger.error).toHaveBeenCalled();
        }));
        it('should throw ForbiddenError if admin lacks permission', () => __awaiter(void 0, void 0, void 0, function* () {
            // Arrange
            const nonAdminUser = Object.assign(Object.assign({}, MOCK_ADMIN_USER), { roles: ['user'] });
            // Act & Assert
            yield expect(service.deleteUser(nonAdminUser, MOCK_TARGET_USERNAME))
                .rejects.toHaveProperty('statusCode', 403);
            expect(mockUserMgmtAdapter.adminDeleteUser).not.toHaveBeenCalled();
        }));
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
