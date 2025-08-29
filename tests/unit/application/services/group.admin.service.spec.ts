import 'reflect-metadata';
import { container } from 'tsyringe';
import { GroupAdminService } from '../../../../src/application/services/group.admin.service';
import { CreateGroupDetails } from '../../../../src/application/interfaces/IUserMgmtAdapter';
import { AdminUser } from '../../../../src/shared/types/admin-user.interface';
import { Group } from '../../../../src/domain/entities/Group';
import { Role } from '../../../../src/domain/entities/Role';
import { GroupNotFoundError, RoleNotFoundError, AssignmentError } from '../../../../src/domain/exceptions/UserManagementError';
import { BaseError } from '../../../../src/shared/errors/BaseError';
import { userMgmtAdapterMock } from '../../../mocks/userMgmtAdapter.mock';
import { assignmentRepositoryMock } from '../../../mocks/assignmentRepository.mock';
import { roleRepositoryMock } from '../../../mocks/roleRepository.mock';
import { loggerMock } from '../../../mocks/logger.mock';

describe('GroupAdminService', () => {
    let service: GroupAdminService;

    const adminUser: AdminUser = {
        id: 'admin-id',
        username: 'admin-user',
        roles: ['admin'],
    };

    beforeEach(() => {
        service = container.resolve(GroupAdminService);
    });

    describe('createGroup', () => {
        it('should create a group successfully', async () => {
            const groupDetails: CreateGroupDetails = { groupName: 'new-group', description: 'A new group' };
            const cognitoGroup = { GroupName: 'new-group', Description: 'A new group' };
            userMgmtAdapterMock.adminCreateGroup.mockResolvedValue(cognitoGroup as any);

            const result = await service.createGroup(adminUser, groupDetails);

            expect(userMgmtAdapterMock.adminCreateGroup).toHaveBeenCalledWith(groupDetails);
            expect(result).toBeInstanceOf(Group);
            expect(result.groupName).toBe('new-group');
            expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('CREATE_GROUP'), expect.any(Object));
        });
    });

    describe('getGroup', () => {
        it('should return a group if found', async () => {
            const groupName = 'test-group';
            const cognitoGroup = { GroupName: groupName, Description: 'Test group' };
            userMgmtAdapterMock.adminGetGroup.mockResolvedValue(cognitoGroup as any);

            const result = await service.getGroup(adminUser, groupName);

            expect(userMgmtAdapterMock.adminGetGroup).toHaveBeenCalledWith(groupName);
            expect(result).toBeInstanceOf(Group);
            expect(result?.groupName).toBe(groupName);
        });

        it('should return null if group not found', async () => {
            const groupName = 'non-existent-group';
            userMgmtAdapterMock.adminGetGroup.mockResolvedValue(null);

            const result = await service.getGroup(adminUser, groupName);

            expect(result).toBeNull();
        });
    });

    describe('listGroups', () => {
        it('should list active groups by default', async () => {
            const cognitoGroups = {
                groups: [
                    { GroupName: 'active-group', Description: JSON.stringify({ description: 'Active group', status: 'ACTIVE' }), Precedence: 1 },
                    { GroupName: 'inactive--group', Description: JSON.stringify({ description: 'Inactive group', status: 'INACTIVE' }), Precedence: 0 },
                ],
                nextToken: 'token'
            };
            userMgmtAdapterMock.adminListGroups.mockResolvedValue(cognitoGroups as any);

            const result = await service.listGroups(adminUser);

            expect(userMgmtAdapterMock.adminListGroups).toHaveBeenCalledWith(undefined, undefined, undefined);
            expect(result.groups.length).toBe(1);
            expect(result.groups[0].groupName).toBe('active-group');
            expect(result.nextToken).toBe('token');
        });

        it('should include inactive groups when specified', async () => {
            const cognitoGroups = {
                groups: [
                    { GroupName: 'active-group', Status: 'ACTIVE' },
                    { GroupName: 'inactive-group', Status: 'INACTIVE' },
                ]
            };
            userMgmtAdapterMock.adminListGroups.mockResolvedValue(cognitoGroups as any);

            const result = await service.listGroups(adminUser, undefined, undefined, undefined, true);

            expect(result.groups.length).toBe(2);
        });
    });

    describe('deleteGroup', () => {
        it('should delete a group successfully', async () => {
            const groupName = 'test-group';
            userMgmtAdapterMock.adminDeleteGroup.mockResolvedValue(undefined);

            await service.deleteGroup(adminUser, groupName);

            expect(userMgmtAdapterMock.adminDeleteGroup).toHaveBeenCalledWith(groupName);
            expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('DEACTIVATE_GROUP'), expect.any(Object));
        });
    });

    describe('reactivateGroup', () => {
        it('should reactivate a group successfully', async () => {
            const groupName = 'test-group';
            userMgmtAdapterMock.adminReactivateGroup.mockResolvedValue(undefined);

            await service.reactivateGroup(adminUser, groupName);

            expect(userMgmtAdapterMock.adminReactivateGroup).toHaveBeenCalledWith(groupName);
            expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('REACTIVATE_GROUP'), expect.any(Object));
        });
    });

    describe('assignRoleToGroup', () => {
        it('should assign a role to a group successfully', async () => {
            const groupName = 'test-group';
            const roleName = 'test-role';
            const now = new Date();
            const group = new Group(groupName, 'description', 'ACTIVE', 0, now, now);
            const role = new Role(roleName, 'description', new Date(), new Date());

            // Mock getGroup internal call
            jest.spyOn(service, 'getGroup').mockResolvedValue(group);
            roleRepositoryMock.findByName.mockResolvedValue(role);
            assignmentRepositoryMock.assignRoleToGroup.mockResolvedValue();

            await service.assignRoleToGroup(adminUser, groupName, roleName);

            expect(assignmentRepositoryMock.assignRoleToGroup).toHaveBeenCalledWith(groupName, roleName);
        });

        it('should throw GroupNotFoundError if group does not exist', async () => {
            const groupName = 'non-existent-group';
            const roleName = 'test-role';

            jest.spyOn(service, 'getGroup').mockResolvedValue(null);

            await expect(service.assignRoleToGroup(adminUser, groupName, roleName)).rejects.toThrow(GroupNotFoundError);
        });

        it('should throw RoleNotFoundError if role does not exist', async () => {
            const groupName = 'test-group';
            const roleName = 'non-existent-role';
            const now = new Date();
            const group = new Group(groupName, 'description', 'ACTIVE', 0, now, now);

            jest.spyOn(service, 'getGroup').mockResolvedValue(group);
            roleRepositoryMock.findByName.mockResolvedValue(null);

            await expect(service.assignRoleToGroup(adminUser, groupName, roleName)).rejects.toThrow(RoleNotFoundError);
        });
    });

    describe('removeRoleFromGroup', () => {
        it('should remove a role from a group successfully', async () => {
            const groupName = 'test-group';
            const roleName = 'test-role';
            assignmentRepositoryMock.removeRoleFromGroup.mockResolvedValue();

            await service.removeRoleFromGroup(adminUser, groupName, roleName);

            expect(assignmentRepositoryMock.removeRoleFromGroup).toHaveBeenCalledWith(groupName, roleName);
        });

        it('should throw AssignmentError on failure', async () => {
            const groupName = 'test-group';
            const roleName = 'test-role';
            const error = new Error('DB error');
            assignmentRepositoryMock.removeRoleFromGroup.mockRejectedValue(error);

            await expect(service.removeRoleFromGroup(adminUser, groupName, roleName)).rejects.toThrow(AssignmentError);
        });
    });

    describe('listRolesForGroup', () => {
        it('should list roles for a group', async () => {
            const groupName = 'test-group';
            const roles = ['role1', 'role2'];
            const now = new Date();
            const group = new Group(groupName, 'description', 'ACTIVE', 0, now, now);

            jest.spyOn(service, 'getGroup').mockResolvedValue(group);
            assignmentRepositoryMock.findRolesByGroupName.mockResolvedValue(roles);

            const result = await service.listRolesForGroup(adminUser, groupName);

            expect(result).toEqual(roles);
        });

        it('should throw GroupNotFoundError if group does not exist', async () => {
            const groupName = 'non-existent-group';
            jest.spyOn(service, 'getGroup').mockResolvedValue(null);

            await expect(service.listRolesForGroup(adminUser, groupName)).rejects.toThrow(GroupNotFoundError);
        });
    });

    describe('Permissions', () => {
        it('should throw ForbiddenError if admin user does not have required role', async () => {
            const nonAdminUser: AdminUser = { id: 'non-admin', username: 'non-admin-user', roles: ['viewer'] };
            const details: CreateGroupDetails = { groupName: 'new-group', description: 'A new group' };

            await expect(service.createGroup(nonAdminUser, details)).rejects.toThrow(BaseError);
            await expect(service.createGroup(nonAdminUser, details)).rejects.toHaveProperty('statusCode', 403);
        });
    });
});