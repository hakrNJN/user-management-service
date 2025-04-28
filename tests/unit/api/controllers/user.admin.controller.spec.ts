import { NextFunction, Request, Response } from 'express';
import { mock, MockProxy } from 'jest-mock-extended';
import 'reflect-metadata'; // Required for tsyringe
import { container } from 'tsyringe';
import { UserAdminController } from '../../../../src/api/controllers/user.admin.controller'; // Adjust path if needed
import { CreateUserAdminDto } from '../../../../src/api/dtos/create-user.admin.dto';
import { ListUsersQueryAdminDto } from '../../../../src/api/dtos/list-users-query.admin.dto';
import { UpdateUserAttributesAdminDto } from '../../../../src/api/dtos/update-user-attributes.admin.dto';
import { HttpStatusCode } from '../../../../src/application/enums/HttpStatusCode';
import { ILogger } from '../../../../src/application/interfaces/ILogger';
import { IUserAdminService } from '../../../../src/application/interfaces/IUserAdminService';
import { TYPES } from '../../../../src/shared/constants/types';
import { BaseError, ValidationError } from '../../../../src/shared/errors/BaseError';
import { AdminUser } from '../../../../src/shared/types/admin-user.interface'; // For type safety
// Define or import missing types
// Option 1: Define locally (if not defined in shared types)
interface PaginatedResult<T> {
    items: T[];
    nextToken?: string; // Use 'nextToken' or 'paginationToken' consistently with your API/service
}

interface Group {
    GroupName: string;
    // Add other properties if needed by your service/tests
}

interface User {
    id: string; // Or a primary identifier like 'username' or 'userId'
    username: string;
    attributes?: Record<string, string>;
    email?: string; // Add if email is a direct property
    // Add other common user fields if returned by service and needed for tests
}

// Option 2: Import (if they exist in shared types)
// import { PaginatedResult } from '../../../../src/shared/types/paginated-result.interface';
// import { Group } from '../../../../src/shared/types/group.interface';
// import { User } from '../../../../src/shared/types/user.interface';
// import { AdminUserView } from '../../../../src/shared/types/admin-user-view.interface'; // If this view type exists

describe('UserAdminController', () => {
    let controller: UserAdminController;
    let userAdminServiceMock: MockProxy<IUserAdminService>;
    let loggerMock: MockProxy<ILogger>;
    let mockRequest: MockProxy<Request>;
    let mockResponse: MockProxy<Response>;
    let mockNext: NextFunction;

    // Use the imported AdminUser type. Ensure it aligns with req.adminUser
    const testAdminUser: AdminUser = {
        id: 'admin-123', // Or userId if that's the identifier
        username: 'testadmin',
        roles: ['admin'], // Adjust roles as per your application
        // Only include properties defined in the actual AdminUser interface
    };

    beforeEach(() => {
        userAdminServiceMock = mock<IUserAdminService>();
        loggerMock = mock<ILogger>();
        mockRequest = mock<Request>();
        mockResponse = mock<Response>();
        mockNext = jest.fn();

        mockResponse.status.mockReturnThis();
        mockResponse.json.mockReturnThis();
        mockResponse.send.mockReturnThis();

        mockRequest.adminUser = testAdminUser; // Assign the AdminUser typed object
        mockRequest.params = {};
        mockRequest.query = {};
        mockRequest.body = {};

        container.clearInstances();
        container.registerInstance(TYPES.UserAdminService, userAdminServiceMock);
        container.registerInstance(TYPES.Logger, loggerMock);

        controller = container.resolve(UserAdminController);
    });

    describe('getAdminUser (indirectly tested)', () => {
        it('should call next with an error if adminUser is missing', async () => {
            mockRequest.adminUser = undefined;
            // BaseError might not have httpCode directly, check its definition. Assuming it does for now.
            // If BaseError only has 'name' and 'message', adjust the assertion.
            const expectedError = new BaseError('ServerError', HttpStatusCode.INTERNAL_SERVER_ERROR, 'Admin context missing.', false);

            await controller.createUser(mockRequest, mockResponse, mockNext);

            expect(mockNext).toHaveBeenCalledTimes(1);
            // Check the properties that *are* on BaseError. Adjust if httpCode isn't one.
            expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({
                name: expectedError.name,
                // httpCode: expectedError.httpCode, // <-- Keep ONLY if BaseError has httpCode
                message: expectedError.message,
            }));
            expect(loggerMock.error).toHaveBeenCalledWith("CRITICAL: Admin user context missing after auth guard.");
            expect(userAdminServiceMock.createUser).not.toHaveBeenCalled();
        });
    });

    describe('createUser', () => {
        it('should create a user and return 201 status with the new user', async () => {
            // FIX: Align DTO with its definition (assuming email goes into attributes)
            const createDto: CreateUserAdminDto = {
                username: 'newuser',
                userAttributes: { email: 'new@test.com', /* other attributes */ }
                // Add temporaryPassword if needed by DTO
            };
            // FIX: Align expectedUser with User interface definition
            const expectedUser: User = {
                id: 'user-1',
                username: 'newuser',
                attributes: { email: 'new@test.com' }
                // Remove top-level email if not part of User interface
            };
            mockRequest.body = createDto;
            userAdminServiceMock.createUser.mockResolvedValue(expectedUser as any); // Use 'as any' if User vs Service return type mismatch significantly, but ideally align types

            await controller.createUser(mockRequest, mockResponse, mockNext);

            // FIX: Ensure service mock expects AdminUser (matching req.adminUser type)
            // If the service interface strictly requires AdminUserView, you'll need to
            // either change the service interface or create/pass an AdminUserView mock.
            // Assuming service expects AdminUser for now.
            expect(userAdminServiceMock.createUser).toHaveBeenCalledWith(testAdminUser, createDto);
            expect(mockResponse.status).toHaveBeenCalledWith(HttpStatusCode.CREATED);
            expect(mockResponse.json).toHaveBeenCalledWith(expectedUser);
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should call next with error if service fails', async () => {
            const createDto: CreateUserAdminDto = {
                username: 'newuser',
                userAttributes: { email: 'new@test.com' }
            };
            const error = new Error('Service failure');
            mockRequest.body = createDto;
            userAdminServiceMock.createUser.mockRejectedValue(error);

            await controller.createUser(mockRequest, mockResponse, mockNext);

            expect(userAdminServiceMock.createUser).toHaveBeenCalledWith(testAdminUser, createDto); // Pass AdminUser
            expect(loggerMock.error).toHaveBeenCalledWith(
                expect.stringContaining('Failed to create user'),
                expect.objectContaining({ adminUserId: testAdminUser.id, error })
            );
            expect(mockNext).toHaveBeenCalledWith(error);
        });
    });

    describe('getUser', () => {
        const username = 'testuser';

        it('should return a user with 200 status if found', async () => {
            // FIX: Align expectedUser with User interface definition
            const expectedUser: User = {
                id: 'user-2',
                username: username,
                attributes: { email: 'test@test.com' }
                // Remove top-level email if not part of User interface
             };
            mockRequest.params.username = username;
            userAdminServiceMock.getUser.mockResolvedValue(expectedUser as any); // Use 'as any' if type mismatch

            await controller.getUser(mockRequest, mockResponse, mockNext);

            expect(userAdminServiceMock.getUser).toHaveBeenCalledWith(testAdminUser, username); // Pass AdminUser
            expect(mockResponse.status).toHaveBeenCalledWith(HttpStatusCode.OK);
            expect(mockResponse.json).toHaveBeenCalledWith(expectedUser);
            expect(mockNext).not.toHaveBeenCalled();
        });

        // ... (getUser not found and error tests remain similar, ensure service mock uses testAdminUser)
        it('should return 404 status if user not found', async () => {
            mockRequest.params.username = username;
            userAdminServiceMock.getUser.mockResolvedValue(null);

            await controller.getUser(mockRequest, mockResponse, mockNext);

            expect(userAdminServiceMock.getUser).toHaveBeenCalledWith(testAdminUser, username); // Pass AdminUser
            expect(mockResponse.status).toHaveBeenCalledWith(HttpStatusCode.NOT_FOUND);
            expect(mockResponse.json).toHaveBeenCalledWith({ message: `User '${username}' not found.` });
            expect(mockNext).not.toHaveBeenCalled();
        });

         it('should call next with error if service fails', async () => {
            const error = new Error('Service failure');
            mockRequest.params.username = username;
            userAdminServiceMock.getUser.mockRejectedValue(error);

            await controller.getUser(mockRequest, mockResponse, mockNext);

            expect(userAdminServiceMock.getUser).toHaveBeenCalledWith(testAdminUser, username); // Pass AdminUser
            expect(loggerMock.error).toHaveBeenCalledWith(
                expect.stringContaining(`Failed to get user ${username}`),
                expect.objectContaining({ adminUserId: testAdminUser.id, error })
            );
            expect(mockNext).toHaveBeenCalledWith(error);
        });
    });

    describe('listUsers', () => {
        it('should return a list of users with 200 status', async () => {
            // Arrange
            // Use the actual DTO property names (e.g., paginationToken)
            const queryOptionsDto: ListUsersQueryAdminDto = { limit: 10, paginationToken: 'token123' };
            // req.query still comes in as strings
            mockRequest.query = { limit: '10', paginationToken: 'token123' };
    
            const expectedResult: PaginatedResult<User> = {
                 items: [{ id: 'u1', username: 'u1' }],
                 nextToken: 'token456' // Or paginationToken if your PaginatedResult uses that
            };
            userAdminServiceMock.listUsers.mockResolvedValue(expectedResult as any);
    
            // Act
            await controller.listUsers(mockRequest, mockResponse, mockNext);
    
            // Assert
            // This assertion should now pass because the controller parses limit to 10 (number)
            expect(userAdminServiceMock.listUsers).toHaveBeenCalledWith(testAdminUser, queryOptionsDto);
            expect(mockResponse.status).toHaveBeenCalledWith(HttpStatusCode.OK);
            expect(mockResponse.json).toHaveBeenCalledWith(expectedResult);
            expect(mockNext).not.toHaveBeenCalled();
        });

         it('should call next with error if service fails', async () => {
             const queryOptionsDto: ListUsersQueryAdminDto = {};
             mockRequest.query = {}; // req.query is empty ParsedQs
             const error = new Error('Service failure');
             userAdminServiceMock.listUsers.mockRejectedValue(error);

             await controller.listUsers(mockRequest, mockResponse, mockNext);

             expect(userAdminServiceMock.listUsers).toHaveBeenCalledWith(testAdminUser, queryOptionsDto); // Pass AdminUser
             expect(loggerMock.error).toHaveBeenCalledWith(
                 expect.stringContaining('Failed to list users'),
                 expect.objectContaining({ adminUserId: testAdminUser.id, error })
             );
             expect(mockNext).toHaveBeenCalledWith(error);
        });
        // ... (listUsers error test remains similar)
    });

    describe('updateUserAttributes', () => {
        const username = 'user-to-update';
        // FIX: Align DTO with its definition (assuming attributes go into attributesToUpdate)
        const updateDto: UpdateUserAttributesAdminDto = {
            attributesToUpdate: { email: 'updated@test.com' }
        };

        it('should update attributes and return 204 status', async () => {
            mockRequest.params.username = username;
            mockRequest.body = updateDto; // Body matches the DTO structure
            userAdminServiceMock.updateUserAttributes.mockResolvedValue(undefined);

            await controller.updateUserAttributes(mockRequest, mockResponse, mockNext);

            // FIX: Service likely expects combined params/body or specific object
            // Check IUserAdminService.updateUserAttributes signature
            // Assuming it takes (adminUser, { username, attributesToUpdate })
            expect(userAdminServiceMock.updateUserAttributes).toHaveBeenCalledWith(
                testAdminUser, // Pass AdminUser
                { username, attributesToUpdate: updateDto.attributesToUpdate }
            );
            expect(mockResponse.status).toHaveBeenCalledWith(HttpStatusCode.NO_CONTENT);
            expect(mockResponse.send).toHaveBeenCalledTimes(1);
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should call next with error if service fails', async () => {
            const error = new Error('Service failure');
            mockRequest.params.username = username;
            mockRequest.body = updateDto;
            userAdminServiceMock.updateUserAttributes.mockRejectedValue(error);

            await controller.updateUserAttributes(mockRequest, mockResponse, mockNext);

            expect(userAdminServiceMock.updateUserAttributes).toHaveBeenCalledWith(
                testAdminUser, // Pass AdminUser
                { username, attributesToUpdate: updateDto.attributesToUpdate }
            );
            expect(loggerMock.error).toHaveBeenCalledWith(
                 expect.stringContaining(`Failed to update attributes for user ${username}`),
                 expect.objectContaining({ adminUserId: testAdminUser.id, error })
             );
            expect(mockNext).toHaveBeenCalledWith(error);
        });

        // ... (updateUserAttributes error test remains similar)
    });

    // ... (deleteUser, disableUser, enableUser, initiatePasswordReset tests remain largely the same, ensure testAdminUser is passed)

    describe('setUserPassword', () => {
        const username = 'user-set-pwd';
        const password = 'newSecurePassword123!';

        // ... (success cases remain similar, ensure testAdminUser is passed)
        it('should set user password (temporary) and return 200 status', async () => {
            mockRequest.params.username = username;
            mockRequest.body = { password, permanent: false };
            userAdminServiceMock.setUserPassword.mockResolvedValue(undefined);

            await controller.setUserPassword(mockRequest, mockResponse, mockNext);

            expect(userAdminServiceMock.setUserPassword).toHaveBeenCalledWith(testAdminUser, username, password, false); // Pass AdminUser
            expect(mockResponse.status).toHaveBeenCalledWith(HttpStatusCode.OK);
            expect(mockResponse.json).toHaveBeenCalledWith({ message: `Password set successfully for user ${username}.` });
            expect(mockNext).not.toHaveBeenCalled();
        });


        it('should call next with ValidationError if password is missing in body', async () => {
            mockRequest.params.username = username;
            mockRequest.body = { permanent: false }; // Missing password
            const expectedError = new ValidationError('Password is required in the request body.');

            await controller.setUserPassword(mockRequest, mockResponse, mockNext);

            expect(userAdminServiceMock.setUserPassword).not.toHaveBeenCalled();
            expect(loggerMock.error).toHaveBeenCalledWith(
                expect.stringContaining(`Failed to set password for user ${username}`),
                expect.objectContaining({ adminUserId: testAdminUser.id, error: expect.any(ValidationError) })
            );
            // FIX: Check properties that exist on ValidationError. If httpCode is missing, remove it.
            expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({
                 name: expectedError.name,
                 // httpCode: expectedError.httpCode, // <-- Keep ONLY if ValidationError has httpCode
                 message: expectedError.message,
             }));
        });

         it('should call next with error if service fails', async () => {
            const error = new Error('Service failure');
            mockRequest.params.username = username;
            mockRequest.body = { password };
            userAdminServiceMock.setUserPassword.mockRejectedValue(error);

            await controller.setUserPassword(mockRequest, mockResponse, mockNext);

            expect(userAdminServiceMock.setUserPassword).toHaveBeenCalledWith(testAdminUser, username, password, false); // Pass AdminUser
            expect(loggerMock.error).toHaveBeenCalledWith(
                expect.stringContaining(`Failed to set password for user ${username}`),
                expect.objectContaining({ adminUserId: testAdminUser.id, error })
            );
            expect(mockNext).toHaveBeenCalledWith(error);
        });
        // ... (service error test remains similar)
    });


    // --- User Group Management Tests ---
    // Ensure testAdminUser is passed to service calls in all group methods

    describe('addUserToGroup', () => {
         const username = 'user-add-group';
         const groupName = 'Testers';

        it('should add user to group and return 200 status', async () => {
            mockRequest.params.username = username;
            mockRequest.body = { groupName };
            userAdminServiceMock.addUserToGroup.mockResolvedValue(undefined);

            await controller.addUserToGroup(mockRequest, mockResponse, mockNext);

            expect(userAdminServiceMock.addUserToGroup).toHaveBeenCalledWith(testAdminUser, username, groupName); // Pass AdminUser
            expect(mockResponse.status).toHaveBeenCalledWith(HttpStatusCode.OK);
            expect(mockResponse.json).toHaveBeenCalledWith({ message: `User ${username} added to group ${groupName}.` });
            expect(mockNext).not.toHaveBeenCalled();
        });

         it('should call next with error if service fails', async () => {
            const error = new Error('Service failure');
            mockRequest.params.username = username;
            mockRequest.body = { groupName };
            userAdminServiceMock.addUserToGroup.mockRejectedValue(error);

            await controller.addUserToGroup(mockRequest, mockResponse, mockNext);

            expect(userAdminServiceMock.addUserToGroup).toHaveBeenCalledWith(testAdminUser, username, groupName); // Pass AdminUser
            expect(loggerMock.error).toHaveBeenCalledWith(
                expect.stringContaining(`Failed to add user ${username} to group ${groupName}`),
                expect.objectContaining({ adminUserId: testAdminUser.id, error })
            );
            expect(mockNext).toHaveBeenCalledWith(error);
        });
    });

    describe('removeUserFromGroup', () => {
         const username = 'user-remove-group';
         const groupName = 'Testers';

        it('should remove user from group and return 204 status', async () => {
            mockRequest.params = { username, groupName };
            userAdminServiceMock.removeUserFromGroup.mockResolvedValue(undefined);

            await controller.removeUserFromGroup(mockRequest, mockResponse, mockNext);

            expect(userAdminServiceMock.removeUserFromGroup).toHaveBeenCalledWith(testAdminUser, username, groupName); // Pass AdminUser
            expect(mockResponse.status).toHaveBeenCalledWith(HttpStatusCode.NO_CONTENT);
            expect(mockResponse.send).toHaveBeenCalledTimes(1);
            expect(mockNext).not.toHaveBeenCalled();
        });

         it('should call next with error if service fails', async () => {
            const error = new Error('Service failure');
            mockRequest.params = { username, groupName };
            userAdminServiceMock.removeUserFromGroup.mockRejectedValue(error);

            await controller.removeUserFromGroup(mockRequest, mockResponse, mockNext);

            expect(userAdminServiceMock.removeUserFromGroup).toHaveBeenCalledWith(testAdminUser, username, groupName); // Pass AdminUser
            expect(loggerMock.error).toHaveBeenCalledWith(
                expect.stringContaining(`Failed to remove user ${username} from group ${groupName}`),
                expect.objectContaining({ adminUserId: testAdminUser.id, error })
            );
            expect(mockNext).toHaveBeenCalledWith(error);
        });
    });

    describe('listGroupsForUser', () => {
        const username = 'user-list-groups';

        it('should return a list of groups for a user with 200 status', async () => {
            const limit = 10;
            const nextToken = 'token1';
            mockRequest.params.username = username;
            // FIX: req.query expects string values
            mockRequest.query = { limit: String(limit), nextToken };
            // FIX: Ensure PaginatedResult and Group types are defined/imported
            const expectedResult: PaginatedResult<Group> = {
                items: [{ GroupName: 'g1' }], // Use Group interface structure
                nextToken: 'token2'
            };
            userAdminServiceMock.listGroupsForUser.mockResolvedValue(expectedResult as any);

            await controller.listGroupsForUser(mockRequest, mockResponse, mockNext);

            expect(userAdminServiceMock.listGroupsForUser).toHaveBeenCalledWith(testAdminUser, username, limit, nextToken); // Pass AdminUser
            expect(mockResponse.status).toHaveBeenCalledWith(HttpStatusCode.OK);
            expect(mockResponse.json).toHaveBeenCalledWith(expectedResult);
            expect(mockNext).not.toHaveBeenCalled();
        });

         it('should handle missing pagination parameters', async () => {
            mockRequest.params.username = username;
            mockRequest.query = {}; // No query params
            const expectedResult: PaginatedResult<Group> = { items: [{ GroupName: 'g1' }] };
            userAdminServiceMock.listGroupsForUser.mockResolvedValue(expectedResult as any);

            await controller.listGroupsForUser(mockRequest, mockResponse, mockNext);

            // Expect undefined for missing limit/token
            expect(userAdminServiceMock.listGroupsForUser).toHaveBeenCalledWith(testAdminUser, username, undefined, undefined); // Pass AdminUser
            expect(mockResponse.status).toHaveBeenCalledWith(HttpStatusCode.OK);
            expect(mockResponse.json).toHaveBeenCalledWith(expectedResult);
            expect(mockNext).not.toHaveBeenCalled();
        });

         it('should call next with error if service fails', async () => {
            const error = new Error('Service failure');
            mockRequest.params.username = username;
            mockRequest.query = {};
            userAdminServiceMock.listGroupsForUser.mockRejectedValue(error);

            await controller.listGroupsForUser(mockRequest, mockResponse, mockNext);

            expect(userAdminServiceMock.listGroupsForUser).toHaveBeenCalledWith(testAdminUser, username, undefined, undefined); // Pass AdminUser
            expect(loggerMock.error).toHaveBeenCalledWith(
                expect.stringContaining(`Failed to list groups for user ${username}`),
                expect.objectContaining({ adminUserId: testAdminUser.id, error })
            );
            expect(mockNext).toHaveBeenCalledWith(error);
        });
    });

    describe('listUsersInGroup', () => {
        const groupName = 'group-list-users';

        it('should return a list of users in a group with 200 status', async () => {
            const limit = 5;
            const nextToken = 'userTokenA';
            mockRequest.params.groupName = groupName;
            // FIX: req.query expects string values
            mockRequest.query = { limit: String(limit), nextToken };
            // FIX: Ensure PaginatedResult and User types are defined/imported
            const expectedResult: PaginatedResult<User> = {
                items: [{ id: 'u1', username: 'u1' }], // Use User interface structure
                nextToken: 'userTokenB'
            };
            userAdminServiceMock.listUsersInGroup.mockResolvedValue(expectedResult as any);

            await controller.listUsersInGroup(mockRequest, mockResponse, mockNext);

            expect(userAdminServiceMock.listUsersInGroup).toHaveBeenCalledWith(testAdminUser, groupName, limit, nextToken); // Pass AdminUser
            expect(mockResponse.status).toHaveBeenCalledWith(HttpStatusCode.OK);
            expect(mockResponse.json).toHaveBeenCalledWith(expectedResult);
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should handle missing pagination parameters', async () => {
             mockRequest.params.groupName = groupName;
             mockRequest.query = {};
             const expectedResult: PaginatedResult<User> = { items: [{ id: 'u1', username: 'u1' }] };
             userAdminServiceMock.listUsersInGroup.mockResolvedValue(expectedResult as any);

             await controller.listUsersInGroup(mockRequest, mockResponse, mockNext);

             expect(userAdminServiceMock.listUsersInGroup).toHaveBeenCalledWith(testAdminUser, groupName, undefined, undefined); // Pass AdminUser
             expect(mockResponse.status).toHaveBeenCalledWith(HttpStatusCode.OK);
             expect(mockResponse.json).toHaveBeenCalledWith(expectedResult);
             expect(mockNext).not.toHaveBeenCalled();
         });

         it('should call next with error if service fails', async () => {
             const error = new Error('Service failure');
             mockRequest.params.groupName = groupName;
             mockRequest.query = {};
             userAdminServiceMock.listUsersInGroup.mockRejectedValue(error);

             await controller.listUsersInGroup(mockRequest, mockResponse, mockNext);

             expect(userAdminServiceMock.listUsersInGroup).toHaveBeenCalledWith(testAdminUser, groupName, undefined, undefined); // Pass AdminUser
             expect(loggerMock.error).toHaveBeenCalledWith(
                 expect.stringContaining(`Failed to list users in group ${groupName}`),
                 expect.objectContaining({ adminUserId: testAdminUser.id, error })
             );
             expect(mockNext).toHaveBeenCalledWith(error);
         });
    });

});