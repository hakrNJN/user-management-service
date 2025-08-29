import 'reflect-metadata';
import { container } from 'tsyringe';
import { UserAdminService } from '../../../../src/application/services/user.admin.service';
import { AdminCreateUserDetails, AdminUpdateUserAttributesDetails, ListUsersOptions, ListUsersResult } from '../../../../src/application/interfaces/IUserMgmtAdapter';
import { AdminUser } from '../../../../src/shared/types/admin-user.interface';
import { BaseError, NotFoundError, ValidationError } from '../../../../src/shared/errors/BaseError';
import { UserAlreadyInGroupError } from '../../../../src/domain/exceptions/UserManagementError';
import { AdminUserView } from '../../../../src/domain/entities/AdminUserView';
import { UserType } from '@aws-sdk/client-cognito-identity-provider';
import { userMgmtAdapterMock } from '../../../mocks/userMgmtAdapter.mock';
import { loggerMock } from '../../../mocks/logger.mock';

describe('UserAdminService', () => {
    let service: UserAdminService;

    const adminUser: AdminUser = {
        id: 'admin-id',
        username: 'admin-user',
        roles: ['admin'],
    };

    beforeEach(() => {
        service = container.resolve(UserAdminService);
    });

    describe('createUser', () => {
        it('should create a user successfully', async () => {
            const userDetails: AdminCreateUserDetails = { username: 'test-user', temporaryPassword: 'Password123!', userAttributes: { email: 'test@example.com' } };
            const cognitoUser: UserType = { Username: 'test-user', Attributes: [{ Name: 'email', Value: 'test@example.com' }] };
            userMgmtAdapterMock.adminCreateUser.mockResolvedValue(cognitoUser);

            const result = await service.createUser(adminUser, userDetails);

            expect(userMgmtAdapterMock.adminCreateUser).toHaveBeenCalledWith(userDetails);
            expect(result).toBeInstanceOf(AdminUserView);
            expect(result.username).toBe('test-user');
            expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('CREATE_USER'), expect.any(Object));
        });

        it('should throw an error if user creation fails', async () => {
            const userDetails: AdminCreateUserDetails = { username: 'test-user', temporaryPassword: 'Password123!', userAttributes: { email: 'test@example.com' } };
            const error = new Error('Creation failed');
            userMgmtAdapterMock.adminCreateUser.mockRejectedValue(error);

            await expect(service.createUser(adminUser, userDetails)).rejects.toThrow('Creation failed');
            expect(loggerMock.error).toHaveBeenCalledWith(expect.stringContaining('FAILED CREATE_USER'), expect.any(Object));
        });
    });

    describe('getUser', () => {
        it('should return a user view with groups if user is found', async () => {
            const username = 'test-user';
            const cognitoUser: UserType = { Username: username, Attributes: [] };
            const groups = { groups: [{ GroupName: 'group1' }] };
            userMgmtAdapterMock.adminGetUser.mockResolvedValue(cognitoUser);
            userMgmtAdapterMock.adminListGroupsForUser.mockResolvedValue(groups as any);

            const result = await service.getUser(adminUser, username);

            expect(userMgmtAdapterMock.adminGetUser).toHaveBeenCalledWith(username);
            expect(userMgmtAdapterMock.adminListGroupsForUser).toHaveBeenCalledWith(username);
            expect(result).toBeInstanceOf(AdminUserView);
            expect(result?.username).toBe(username);
            expect(result?.groups).toEqual(['group1']);
        });

        it('should return null if user is not found', async () => {
            const username = 'non-existent-user';
            userMgmtAdapterMock.adminGetUser.mockRejectedValue(new NotFoundError('User not found'));

            const result = await service.getUser(adminUser, username);

            expect(result).toBeNull();
        });
    });

    describe('listUsers', () => {
        it('should list users with default status CONFIRMED', async () => {
            const options: ListUsersOptions = {};
            const cognitoUsers: ListUsersResult = { users: [{ Username: 'user1' }], paginationToken: 'token' };
            userMgmtAdapterMock.adminListUsers.mockResolvedValue(cognitoUsers);
            userMgmtAdapterMock.adminListGroupsForUser.mockResolvedValue({ groups: [] } as any);

            const result = await service.listUsers(adminUser, options);

            expect(userMgmtAdapterMock.adminListUsers).toHaveBeenCalledWith({ status: 'CONFIRMED' });
            expect(result.users.length).toBe(1);
            expect(result.users[0].username).toBe('user1');
            expect(result.nextToken).toBe('token');
        });

        it('should allow listing users with any status if status is null', async () => {
            const options: ListUsersOptions = { status: null as any }; // Cast to any to allow null
            const cognitoUsers: ListUsersResult = { users: [{ Username: 'user1' }], paginationToken: 'token' };
            userMgmtAdapterMock.adminListUsers.mockResolvedValue(cognitoUsers);
            userMgmtAdapterMock.adminListGroupsForUser.mockResolvedValue({ groups: [] } as any);

            await service.listUsers(adminUser, options);

            expect(userMgmtAdapterMock.adminListUsers).toHaveBeenCalledWith({});
        });
    });

    describe('updateUserAttributes', () => {
        it('should update user attributes successfully', async () => {
            const details: AdminUpdateUserAttributesDetails = { username: 'test-user', attributesToUpdate: { email: 'new@example.com' } };
            userMgmtAdapterMock.adminUpdateUserAttributes.mockResolvedValue(undefined);

            await service.updateUserAttributes(adminUser, details);

            expect(userMgmtAdapterMock.adminUpdateUserAttributes).toHaveBeenCalledWith(details);
            expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('successfully updated attributes'), expect.any(Object));
        });
    });

    describe('deleteUser', () => {
        it('should delete a user successfully', async () => {
            const username = 'test-user';
            userMgmtAdapterMock.adminDeleteUser.mockResolvedValue(undefined);

            await service.deleteUser(adminUser, username);

            expect(userMgmtAdapterMock.adminDeleteUser).toHaveBeenCalledWith(username);
            expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('DELETE_USER'), expect.any(Object));
        });

        it('should throw a validation error when trying to delete own account', async () => {
            const username = adminUser.username;
            await expect(service.deleteUser(adminUser, username)).rejects.toThrow(ValidationError);
        });
    });

    describe('disableUser', () => {
        it('should disable a user successfully', async () => {
            const username = 'test-user';
            userMgmtAdapterMock.adminDisableUser.mockResolvedValue(undefined);

            await service.disableUser(adminUser, username);

            expect(userMgmtAdapterMock.adminDisableUser).toHaveBeenCalledWith(username);
            expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('DEACTIVATE_USER'), expect.any(Object));
        });

        it('should throw a validation error when trying to disable own account', async () => {
            const username = adminUser.username;
            await expect(service.disableUser(adminUser, username)).rejects.toThrow(ValidationError);
        });
    });

    describe('enableUser', () => {
        it('should enable a user successfully', async () => {
            const username = 'test-user';
            userMgmtAdapterMock.adminEnableUser.mockResolvedValue(undefined);

            await service.enableUser(adminUser, username);

            expect(userMgmtAdapterMock.adminEnableUser).toHaveBeenCalledWith(username);
            expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('REACTIVATE_USER'), expect.any(Object));
        });
    });

    describe('initiatePasswordReset', () => {
        it('should initiate password reset successfully', async () => {
            const username = 'test-user';
            userMgmtAdapterMock.adminInitiatePasswordReset.mockResolvedValue(undefined);

            await service.initiatePasswordReset(adminUser, username);

            expect(userMgmtAdapterMock.adminInitiatePasswordReset).toHaveBeenCalledWith(username);
            expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('successfully initiated password reset'), expect.any(Object));
        });
    });

    describe('setUserPassword', () => {
        it('should set user password successfully', async () => {
            const username = 'test-user';
            const password = 'NewPassword123!';
            userMgmtAdapterMock.adminSetUserPassword.mockResolvedValue(undefined);

            await service.setUserPassword(adminUser, username, password, true);

            expect(userMgmtAdapterMock.adminSetUserPassword).toHaveBeenCalledWith(username, password, true);
            expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('SET_USER_PASSWORD'), expect.any(Object));
        });
    });

    describe('addUserToGroup', () => {
        it('should add user to group successfully', async () => {
            const username = 'test-user';
            const groupName = 'group1';
            userMgmtAdapterMock.adminAddUserToGroup.mockResolvedValue(undefined);

            await service.addUserToGroup(adminUser, username, groupName);

            expect(userMgmtAdapterMock.adminAddUserToGroup).toHaveBeenCalledWith(username, groupName);
            expect(loggerMock.info).toHaveBeenCalledWith(`Admin attempting to add user ${username} to group ${groupName}`, { adminUserId: adminUser.id });
            expect(loggerMock.info).toHaveBeenCalledWith(`Admin successfully added user ${username} to group ${groupName}.`);
        });

        it('should throw UserAlreadyInGroupError if user is already in group', async () => {
            const username = 'test-user';
            const groupName = 'group1';
            const error = new Error('User is already in group');
            userMgmtAdapterMock.adminAddUserToGroup.mockRejectedValue(error);

            await expect(service.addUserToGroup(adminUser, username, groupName)).rejects.toThrow(UserAlreadyInGroupError);
        });
    });

    describe('removeUserFromGroup', () => {
        it('should remove user from group successfully', async () => {
            const username = 'test-user';
            const groupName = 'group1';
            userMgmtAdapterMock.adminRemoveUserFromGroup.mockResolvedValue(undefined);

            await service.removeUserFromGroup(adminUser, username, groupName);

            expect(userMgmtAdapterMock.adminRemoveUserFromGroup).toHaveBeenCalledWith(username, groupName);
            expect(loggerMock.info).toHaveBeenCalledWith(`Admin attempting to remove user ${username} from group ${groupName}`, { adminUserId: adminUser.id });
            expect(loggerMock.info).toHaveBeenCalledWith(`Admin successfully removed user ${username} from group ${groupName}.`);
        });
    });

    describe('listGroupsForUser', () => {
        it('should list groups for a user', async () => {
            const username = 'test-user';
            const groups = { groups: [{ GroupName: 'group1' }] };
            userMgmtAdapterMock.adminListGroupsForUser.mockResolvedValue(groups as any);

            const result = await service.listGroupsForUser(adminUser, username);

            expect(userMgmtAdapterMock.adminListGroupsForUser).toHaveBeenCalledWith(username, undefined, undefined);
            expect(result.groups.length).toBe(1);
            expect(result.groups[0].groupName).toBe('group1');
            expect(result.nextToken).toBeUndefined(); // Changed from toBeNull()
        });

        
    });

    describe('listUsersInGroup', () => {
        it('should list users in a group', async () => {
            const groupName = 'group1';
            const users = { users: [{ Username: 'user1' }], nextToken: 'token' };
            userMgmtAdapterMock.adminListUsersInGroup.mockResolvedValue(users as any);

            const result = await service.listUsersInGroup(adminUser, groupName);

            expect(userMgmtAdapterMock.adminListUsersInGroup).toHaveBeenCalledWith(groupName, undefined, undefined);
            expect(result.users.length).toBe(1);
            expect(result.users[0].username).toBe('user1');
            expect(result.nextToken).toBe('token');
        });
    });

    describe('updateUserGroups', () => {
        it('should add and remove groups to match the new set of groups', async () => {
            const username = 'test-user';
            const currentGroups = { groups: [{ GroupName: 'group1' }, { GroupName: 'group2' }] };
            const newGroupNames = ['group2', 'group3'];

            userMgmtAdapterMock.adminListGroupsForUser.mockResolvedValue(currentGroups as any);
            userMgmtAdapterMock.adminAddUserToGroup.mockResolvedValue(undefined);
            userMgmtAdapterMock.adminRemoveUserFromGroup.mockResolvedValue(undefined);

            await service.updateUserGroups(adminUser, username, newGroupNames);

            expect(userMgmtAdapterMock.adminAddUserToGroup).toHaveBeenCalledWith(username, 'group3');
            expect(userMgmtAdapterMock.adminRemoveUserFromGroup).toHaveBeenCalledWith(username, 'group1');
            expect(userMgmtAdapterMock.adminAddUserToGroup).toHaveBeenCalledTimes(1);
            expect(userMgmtAdapterMock.adminRemoveUserFromGroup).toHaveBeenCalledTimes(1);
            expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('UPDATE_USER_GROUPS'), expect.objectContaining({
                added: ['group3'],
                removed: ['group1']
            }));
        });
    });

    describe('Permissions', () => {
        it('should throw ForbiddenError if admin user does not have required role', async () => {
            const nonAdminUser: AdminUser = { id: 'non-admin', username: 'non-admin-user', roles: ['viewer'] };
            const userDetails: AdminCreateUserDetails = { username: 'test-user', temporaryPassword: 'Password123!', userAttributes: { email: 'test@example.com' } };

            await expect(service.createUser(nonAdminUser, userDetails)).rejects.toThrow(BaseError);
            await expect(service.createUser(nonAdminUser, userDetails)).rejects.toHaveProperty('statusCode', 403);
        });
    });
});