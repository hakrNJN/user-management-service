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
require("reflect-metadata"); // Required for tsyringe
const tsyringe_1 = require("tsyringe");
const user_admin_controller_1 = require("../../../../src/api/controllers/user.admin.controller"); // Adjust path if needed
const HttpStatusCode_1 = require("../../../../src/application/enums/HttpStatusCode");
const types_1 = require("../../../../src/shared/constants/types");
const BaseError_1 = require("../../../../src/shared/errors/BaseError");
// Option 2: Import (if they exist in shared types)
// import { PaginatedResult } from '../../../../src/shared/types/paginated-result.interface';
// import { Group } from '../../../../src/shared/types/group.interface';
// import { User } from '../../../../src/shared/types/user.interface';
// import { AdminUserView } from '../../../../src/shared/types/admin-user-view.interface'; // If this view type exists
describe('UserAdminController', () => {
    let controller;
    let userAdminServiceMock;
    let loggerMock;
    let mockRequest;
    let mockResponse;
    let mockNext;
    // Use the imported AdminUser type. Ensure it aligns with req.adminUser
    const testAdminUser = {
        id: 'admin-123', // Or userId if that's the identifier
        username: 'testadmin',
        roles: ['admin'], // Adjust roles as per your application
        // Only include properties defined in the actual AdminUser interface
    };
    beforeEach(() => {
        userAdminServiceMock = (0, jest_mock_extended_1.mock)();
        loggerMock = (0, jest_mock_extended_1.mock)();
        mockRequest = (0, jest_mock_extended_1.mock)();
        mockResponse = (0, jest_mock_extended_1.mock)();
        mockNext = jest.fn();
        mockResponse.status.mockReturnThis();
        mockResponse.json.mockReturnThis();
        mockResponse.send.mockReturnThis();
        mockRequest.adminUser = testAdminUser; // Assign the AdminUser typed object
        mockRequest.params = {};
        mockRequest.query = {};
        mockRequest.body = {};
        tsyringe_1.container.clearInstances();
        tsyringe_1.container.registerInstance(types_1.TYPES.UserAdminService, userAdminServiceMock);
        tsyringe_1.container.registerInstance(types_1.TYPES.Logger, loggerMock);
        controller = tsyringe_1.container.resolve(user_admin_controller_1.UserAdminController);
    });
    describe('getAdminUser (indirectly tested)', () => {
        it('should call next with an error if adminUser is missing', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRequest.adminUser = undefined;
            // BaseError might not have httpCode directly, check its definition. Assuming it does for now.
            // If BaseError only has 'name' and 'message', adjust the assertion.
            const expectedError = new BaseError_1.BaseError('ServerError', HttpStatusCode_1.HttpStatusCode.INTERNAL_SERVER_ERROR, 'Admin context missing.', false);
            yield controller.createUser(mockRequest, mockResponse, mockNext);
            expect(mockNext).toHaveBeenCalledTimes(1);
            // Check the properties that *are* on BaseError. Adjust if httpCode isn't one.
            expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({
                name: expectedError.name,
                // httpCode: expectedError.httpCode, // <-- Keep ONLY if BaseError has httpCode
                message: expectedError.message,
            }));
            expect(loggerMock.error).toHaveBeenCalledWith("CRITICAL: Admin user context missing after auth guard.");
            expect(userAdminServiceMock.createUser).not.toHaveBeenCalled();
        }));
    });
    describe('createUser', () => {
        it('should create a user and return 201 status with the new user', () => __awaiter(void 0, void 0, void 0, function* () {
            const createDto = {
                username: 'newuser',
                userAttributes: { email: 'new@test.com', /* other attributes */ }
                // Add temporaryPassword if needed by DTO
            };
            const expectedUser = {
                id: 'user-1',
                username: 'newuser',
                attributes: { email: 'new@test.com' }
                // Remove top-level email if not part of User interface
            };
            mockRequest.body = createDto;
            userAdminServiceMock.createUser.mockResolvedValue(expectedUser); // Use 'as any' if User vs Service return type mismatch significantly, but ideally align types
            yield controller.createUser(mockRequest, mockResponse, mockNext);
            // If the service interface strictly requires AdminUserView, you'll need to
            // either change the service interface or create/pass an AdminUserView mock.
            // Assuming service expects AdminUser for now.
            expect(userAdminServiceMock.createUser).toHaveBeenCalledWith(testAdminUser, createDto);
            expect(mockResponse.status).toHaveBeenCalledWith(HttpStatusCode_1.HttpStatusCode.CREATED);
            expect(mockResponse.json).toHaveBeenCalledWith(expectedUser);
            expect(mockNext).not.toHaveBeenCalled();
        }));
        it('should call next with error if service fails', () => __awaiter(void 0, void 0, void 0, function* () {
            const createDto = {
                username: 'newuser',
                userAttributes: { email: 'new@test.com' }
            };
            const error = new Error('Service failure');
            mockRequest.body = createDto;
            userAdminServiceMock.createUser.mockRejectedValue(error);
            yield controller.createUser(mockRequest, mockResponse, mockNext);
            expect(userAdminServiceMock.createUser).toHaveBeenCalledWith(testAdminUser, createDto); // Pass AdminUser
            expect(loggerMock.error).toHaveBeenCalledWith(
            // Match the EXACT message logged by the controller
            '[UserAdminCtrl] Failed to [operation name]', // <<< Or the specific message if you changed the template
            expect.objectContaining({
                adminUserId: testAdminUser.id,
                // It logs targetUsername based on req.params, which is empty here
                targetUsername: 'user name not found', // <<< As per controller code
                errorName: error.name,
                errorMessage: error.message,
            }));
            expect(mockNext).toHaveBeenCalledWith(error);
        }));
    });
    describe('getUser', () => {
        const username = 'testuser';
        it('should return a user with 200 status if found', () => __awaiter(void 0, void 0, void 0, function* () {
            const expectedUser = {
                id: 'user-2',
                username: username,
                attributes: { email: 'test@test.com' }
                // Remove top-level email if not part of User interface
            };
            mockRequest.params.username = username;
            userAdminServiceMock.getUser.mockResolvedValue(expectedUser); // Use 'as any' if type mismatch
            yield controller.getUser(mockRequest, mockResponse, mockNext);
            expect(userAdminServiceMock.getUser).toHaveBeenCalledWith(testAdminUser, username); // Pass AdminUser
            expect(mockResponse.status).toHaveBeenCalledWith(HttpStatusCode_1.HttpStatusCode.OK);
            expect(mockResponse.json).toHaveBeenCalledWith(expectedUser);
            expect(mockNext).not.toHaveBeenCalled();
        }));
        // ... (getUser not found and error tests remain similar, ensure service mock uses testAdminUser)
        it('should return 404 status if user not found', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRequest.params.username = username;
            userAdminServiceMock.getUser.mockResolvedValue(null);
            yield controller.getUser(mockRequest, mockResponse, mockNext);
            expect(userAdminServiceMock.getUser).toHaveBeenCalledWith(testAdminUser, username); // Pass AdminUser
            expect(mockResponse.status).toHaveBeenCalledWith(HttpStatusCode_1.HttpStatusCode.NOT_FOUND);
            expect(mockResponse.json).toHaveBeenCalledWith({ message: `User '${username}' not found.` });
            expect(mockNext).not.toHaveBeenCalled();
        }));
        it('should call next with error if service fails', () => __awaiter(void 0, void 0, void 0, function* () {
            const error = new Error('Service failure');
            mockRequest.params.username = username;
            userAdminServiceMock.getUser.mockRejectedValue(error);
            yield controller.getUser(mockRequest, mockResponse, mockNext);
            expect(userAdminServiceMock.getUser).toHaveBeenCalledWith(testAdminUser, username); // Pass AdminUser
            expect(loggerMock.error).toHaveBeenCalledWith(expect.stringContaining(`Failed to get user ${username}`), // Message still matches (or adjust slightly if controller changed it)
            expect.objectContaining({
                adminUserId: testAdminUser.id,
                targetUsername: username, // Controller logs this now
                errorName: error.name,
                errorMessage: error.message,
            }));
            expect(mockNext).toHaveBeenCalledWith(error);
        }));
    });
    describe('listUsers', () => {
        it('should return a list of users with 200 status', () => __awaiter(void 0, void 0, void 0, function* () {
            // Arrange
            // Use the actual DTO property names (e.g., paginationToken)
            const queryOptionsDto = { limit: 10, paginationToken: 'token123' };
            // req.query still comes in as strings
            mockRequest.query = { limit: '10', paginationToken: 'token123' };
            const expectedResult = {
                items: [{ id: 'u1', username: 'u1' }],
                nextToken: 'token456' // Or paginationToken if your PaginatedResult uses that
            };
            userAdminServiceMock.listUsers.mockResolvedValue(expectedResult);
            // Act
            yield controller.listUsers(mockRequest, mockResponse, mockNext);
            // Assert
            // This assertion should now pass because the controller parses limit to 10 (number)
            expect(userAdminServiceMock.listUsers).toHaveBeenCalledWith(testAdminUser, queryOptionsDto);
            expect(mockResponse.status).toHaveBeenCalledWith(HttpStatusCode_1.HttpStatusCode.OK);
            expect(mockResponse.json).toHaveBeenCalledWith(expectedResult);
            expect(mockNext).not.toHaveBeenCalled();
        }));
        it('should call next with error if service fails', () => __awaiter(void 0, void 0, void 0, function* () {
            const queryOptionsDto = {};
            mockRequest.query = {}; // req.query is empty ParsedQs
            const error = new Error('Service failure');
            userAdminServiceMock.listUsers.mockRejectedValue(error);
            yield controller.listUsers(mockRequest, mockResponse, mockNext);
            expect(userAdminServiceMock.listUsers).toHaveBeenCalledWith(testAdminUser, queryOptionsDto);
            expect(loggerMock.error).toHaveBeenCalledWith(`[UserAdminCtrl] Failed to List users user name not found`, // Change "user" to "users"
            expect.objectContaining({
                adminUserId: testAdminUser.id,
                targetUsername: 'user name not found',
                errorName: error.name,
                errorMessage: error.message,
            }));
            expect(mockNext).toHaveBeenCalledWith(error);
        }));
        // ... (listUsers error test remains similar)
    });
    describe('updateUserAttributes', () => {
        const username = 'user-to-update';
        const updateDto = {
            attributesToUpdate: { email: 'updated@test.com' }
        };
        it('should update attributes and return 204 status', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRequest.params.username = username;
            mockRequest.body = updateDto; // Body matches the DTO structure
            userAdminServiceMock.updateUserAttributes.mockResolvedValue(undefined);
            yield controller.updateUserAttributes(mockRequest, mockResponse, mockNext);
            // Check IUserAdminService.updateUserAttributes signature
            // Assuming it takes (adminUser, { username, attributesToUpdate })
            expect(userAdminServiceMock.updateUserAttributes).toHaveBeenCalledWith(testAdminUser, // Pass AdminUser
            { username, attributesToUpdate: updateDto.attributesToUpdate });
            expect(mockResponse.status).toHaveBeenCalledWith(HttpStatusCode_1.HttpStatusCode.NO_CONTENT);
            expect(mockResponse.send).toHaveBeenCalledTimes(1);
            expect(mockNext).not.toHaveBeenCalled();
        }));
        it('should call next with error if service fails', () => __awaiter(void 0, void 0, void 0, function* () {
            const error = new Error('Service failure');
            mockRequest.params.username = username;
            mockRequest.body = updateDto;
            userAdminServiceMock.updateUserAttributes.mockRejectedValue(error);
            yield controller.updateUserAttributes(mockRequest, mockResponse, mockNext);
            expect(userAdminServiceMock.updateUserAttributes).toHaveBeenCalledWith(testAdminUser, // Pass AdminUser
            { username, attributesToUpdate: updateDto.attributesToUpdate });
            expect(loggerMock.error).toHaveBeenCalledWith(expect.stringContaining(`Failed to update attributes for user ${username}`), expect.objectContaining({ adminUserId: testAdminUser.id, error }));
            expect(mockNext).toHaveBeenCalledWith(error);
        }));
        // ... (updateUserAttributes error test remains similar)
    });
    // ... (deleteUser, disableUser, enableUser, initiatePasswordReset tests remain largely the same, ensure testAdminUser is passed)
    describe('setUserPassword', () => {
        const username = 'user-set-pwd';
        const password = 'newSecurePassword123!';
        // ... (success cases remain similar, ensure testAdminUser is passed)
        it('should set user password (temporary) and return 200 status', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRequest.params.username = username;
            mockRequest.body = { password, permanent: false };
            userAdminServiceMock.setUserPassword.mockResolvedValue(undefined);
            yield controller.setUserPassword(mockRequest, mockResponse, mockNext);
            expect(userAdminServiceMock.setUserPassword).toHaveBeenCalledWith(testAdminUser, username, password, false); // Pass AdminUser
            expect(mockResponse.status).toHaveBeenCalledWith(HttpStatusCode_1.HttpStatusCode.OK);
            expect(mockResponse.json).toHaveBeenCalledWith({ message: `Password set successfully for user ${username}.` });
            expect(mockNext).not.toHaveBeenCalled();
        }));
        it('should call next with ValidationError if password is missing in body', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRequest.params.username = username;
            mockRequest.body = { permanent: false }; // Missing password
            const expectedError = new BaseError_1.ValidationError('Password is required in the request body.');
            yield controller.setUserPassword(mockRequest, mockResponse, mockNext);
            expect(userAdminServiceMock.setUserPassword).not.toHaveBeenCalled();
            expect(loggerMock.error).toHaveBeenCalledWith(expect.stringContaining(`Failed to set password for user ${username}`), expect.objectContaining({ adminUserId: testAdminUser.id, error: expect.any(BaseError_1.ValidationError) }));
            expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({
                name: expectedError.name,
                // httpCode: expectedError.httpCode, // <-- Keep ONLY if ValidationError has httpCode
                message: expectedError.message,
            }));
        }));
        it('should call next with error if service fails', () => __awaiter(void 0, void 0, void 0, function* () {
            const error = new Error('Service failure');
            mockRequest.params.username = username;
            mockRequest.body = { password };
            userAdminServiceMock.setUserPassword.mockRejectedValue(error);
            yield controller.setUserPassword(mockRequest, mockResponse, mockNext);
            expect(userAdminServiceMock.setUserPassword).toHaveBeenCalledWith(testAdminUser, username, password, false); // Pass AdminUser
            expect(loggerMock.error).toHaveBeenCalledWith(expect.stringContaining(`Failed to set password for user ${username}`), expect.objectContaining({ adminUserId: testAdminUser.id, error }));
            expect(mockNext).toHaveBeenCalledWith(error);
        }));
        // ... (service error test remains similar)
    });
    // --- User Group Management Tests ---
    // Ensure testAdminUser is passed to service calls in all group methods
    describe('addUserToGroup', () => {
        const username = 'user-add-group';
        const groupName = 'Testers';
        it('should add user to group and return 200 status', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRequest.params.username = username;
            mockRequest.body = { groupName };
            userAdminServiceMock.addUserToGroup.mockResolvedValue(undefined);
            yield controller.addUserToGroup(mockRequest, mockResponse, mockNext);
            expect(userAdminServiceMock.addUserToGroup).toHaveBeenCalledWith(testAdminUser, username, groupName); // Pass AdminUser
            expect(mockResponse.status).toHaveBeenCalledWith(HttpStatusCode_1.HttpStatusCode.OK);
            expect(mockResponse.json).toHaveBeenCalledWith({ message: `User ${username} added to group ${groupName}.` });
            expect(mockNext).not.toHaveBeenCalled();
        }));
        it('should call next with error if service fails', () => __awaiter(void 0, void 0, void 0, function* () {
            const error = new Error('Service failure');
            mockRequest.params.username = username;
            mockRequest.body = { groupName };
            userAdminServiceMock.addUserToGroup.mockRejectedValue(error);
            yield controller.addUserToGroup(mockRequest, mockResponse, mockNext);
            expect(userAdminServiceMock.addUserToGroup).toHaveBeenCalledWith(testAdminUser, username, groupName); // Pass AdminUser
            expect(loggerMock.error).toHaveBeenCalledWith(expect.stringContaining(`Failed to add user ${username} to group ${groupName}`), expect.objectContaining({ adminUserId: testAdminUser.id, error }));
            expect(mockNext).toHaveBeenCalledWith(error);
        }));
    });
    describe('removeUserFromGroup', () => {
        const username = 'user-remove-group';
        const groupName = 'Testers';
        it('should remove user from group and return 204 status', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRequest.params = { username, groupName };
            userAdminServiceMock.removeUserFromGroup.mockResolvedValue(undefined);
            yield controller.removeUserFromGroup(mockRequest, mockResponse, mockNext);
            expect(userAdminServiceMock.removeUserFromGroup).toHaveBeenCalledWith(testAdminUser, username, groupName); // Pass AdminUser
            expect(mockResponse.status).toHaveBeenCalledWith(HttpStatusCode_1.HttpStatusCode.NO_CONTENT);
            expect(mockResponse.send).toHaveBeenCalledTimes(1);
            expect(mockNext).not.toHaveBeenCalled();
        }));
        it('should call next with error if service fails', () => __awaiter(void 0, void 0, void 0, function* () {
            const error = new Error('Service failure');
            mockRequest.params = { username, groupName };
            userAdminServiceMock.removeUserFromGroup.mockRejectedValue(error);
            yield controller.removeUserFromGroup(mockRequest, mockResponse, mockNext);
            expect(userAdminServiceMock.removeUserFromGroup).toHaveBeenCalledWith(testAdminUser, username, groupName); // Pass AdminUser
            expect(loggerMock.error).toHaveBeenCalledWith(expect.stringContaining(`Failed to remove user ${username} from group ${groupName}`), expect.objectContaining({ adminUserId: testAdminUser.id, error }));
            expect(mockNext).toHaveBeenCalledWith(error);
        }));
    });
    describe('listGroupsForUser', () => {
        const username = 'user-list-groups';
        it('should return a list of groups for a user with 200 status', () => __awaiter(void 0, void 0, void 0, function* () {
            const limit = 10;
            const nextToken = 'token1';
            mockRequest.params.username = username;
            mockRequest.query = { limit: String(limit), nextToken };
            const expectedResult = {
                items: [{ GroupName: 'g1' }], // Use Group interface structure
                nextToken: 'token2'
            };
            userAdminServiceMock.listGroupsForUser.mockResolvedValue(expectedResult);
            yield controller.listGroupsForUser(mockRequest, mockResponse, mockNext);
            expect(userAdminServiceMock.listGroupsForUser).toHaveBeenCalledWith(testAdminUser, username, limit, nextToken); // Pass AdminUser
            expect(mockResponse.status).toHaveBeenCalledWith(HttpStatusCode_1.HttpStatusCode.OK);
            expect(mockResponse.json).toHaveBeenCalledWith(expectedResult);
            expect(mockNext).not.toHaveBeenCalled();
        }));
        it('should handle missing pagination parameters', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRequest.params.username = username;
            mockRequest.query = {}; // No query params
            const expectedResult = { items: [{ GroupName: 'g1' }] };
            userAdminServiceMock.listGroupsForUser.mockResolvedValue(expectedResult);
            yield controller.listGroupsForUser(mockRequest, mockResponse, mockNext);
            // Expect undefined for missing limit/token
            expect(userAdminServiceMock.listGroupsForUser).toHaveBeenCalledWith(testAdminUser, username, undefined, undefined); // Pass AdminUser
            expect(mockResponse.status).toHaveBeenCalledWith(HttpStatusCode_1.HttpStatusCode.OK);
            expect(mockResponse.json).toHaveBeenCalledWith(expectedResult);
            expect(mockNext).not.toHaveBeenCalled();
        }));
        it('should call next with error if service fails', () => __awaiter(void 0, void 0, void 0, function* () {
            const error = new Error('Service failure');
            mockRequest.params.username = username;
            mockRequest.query = {};
            userAdminServiceMock.listGroupsForUser.mockRejectedValue(error);
            yield controller.listGroupsForUser(mockRequest, mockResponse, mockNext);
            expect(userAdminServiceMock.listGroupsForUser).toHaveBeenCalledWith(testAdminUser, username, undefined, undefined); // Pass AdminUser
            expect(loggerMock.error).toHaveBeenCalledWith(expect.stringContaining(`Failed to list groups for user ${username}`), expect.objectContaining({ adminUserId: testAdminUser.id, error }));
            expect(mockNext).toHaveBeenCalledWith(error);
        }));
    });
    describe('listUsersInGroup', () => {
        const groupName = 'group-list-users';
        it('should return a list of users in a group with 200 status', () => __awaiter(void 0, void 0, void 0, function* () {
            const limit = 5;
            const nextToken = 'userTokenA';
            mockRequest.params.groupName = groupName;
            mockRequest.query = { limit: String(limit), nextToken };
            const expectedResult = {
                items: [{ id: 'u1', username: 'u1' }], // Use User interface structure
                nextToken: 'userTokenB'
            };
            userAdminServiceMock.listUsersInGroup.mockResolvedValue(expectedResult);
            yield controller.listUsersInGroup(mockRequest, mockResponse, mockNext);
            expect(userAdminServiceMock.listUsersInGroup).toHaveBeenCalledWith(testAdminUser, groupName, limit, nextToken); // Pass AdminUser
            expect(mockResponse.status).toHaveBeenCalledWith(HttpStatusCode_1.HttpStatusCode.OK);
            expect(mockResponse.json).toHaveBeenCalledWith(expectedResult);
            expect(mockNext).not.toHaveBeenCalled();
        }));
        it('should handle missing pagination parameters', () => __awaiter(void 0, void 0, void 0, function* () {
            mockRequest.params.groupName = groupName;
            mockRequest.query = {};
            const expectedResult = { items: [{ id: 'u1', username: 'u1' }] };
            userAdminServiceMock.listUsersInGroup.mockResolvedValue(expectedResult);
            yield controller.listUsersInGroup(mockRequest, mockResponse, mockNext);
            expect(userAdminServiceMock.listUsersInGroup).toHaveBeenCalledWith(testAdminUser, groupName, undefined, undefined); // Pass AdminUser
            expect(mockResponse.status).toHaveBeenCalledWith(HttpStatusCode_1.HttpStatusCode.OK);
            expect(mockResponse.json).toHaveBeenCalledWith(expectedResult);
            expect(mockNext).not.toHaveBeenCalled();
        }));
        it('should call next with error if service fails', () => __awaiter(void 0, void 0, void 0, function* () {
            const error = new Error('Service failure');
            mockRequest.params.groupName = groupName;
            mockRequest.query = {};
            userAdminServiceMock.listUsersInGroup.mockRejectedValue(error);
            yield controller.listUsersInGroup(mockRequest, mockResponse, mockNext);
            expect(userAdminServiceMock.listUsersInGroup).toHaveBeenCalledWith(testAdminUser, groupName, undefined, undefined); // Pass AdminUser
            expect(loggerMock.error).toHaveBeenCalledWith(expect.stringContaining(`Failed to list users in group ${groupName}`), expect.objectContaining({ adminUserId: testAdminUser.id, error }));
            expect(mockNext).toHaveBeenCalledWith(error);
        }));
    });
});
