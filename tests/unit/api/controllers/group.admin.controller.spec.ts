import 'reflect-metadata';
import { container } from 'tsyringe';
import { GroupAdminController } from '../../../../src/api/controllers/group.admin.controller';
import { Request, Response, NextFunction } from 'express';
import { mock, MockProxy } from 'jest-mock-extended';
import { TYPES } from '../../../../src/shared/constants/types';
import { AdminUser } from '../../../../src/shared/types/admin-user.interface';
import { HttpStatusCode } from '../../../../src/application/enums/HttpStatusCode';
import { Group } from '../../../../src/domain/entities/Group';
import { groupAdminServiceMock } from '../../../mocks/groupAdminService.mock';
import { loggerMock } from '../../../mocks/logger.mock';

describe('GroupAdminController', () => {
    let controller: GroupAdminController;
    let req: MockProxy<Request>;
    let res: MockProxy<Response>;
    let next: MockProxy<NextFunction>;

    const adminUser: AdminUser = { id: 'admin-id', username: 'admin', roles: ['admin'] };

    beforeEach(() => {
        container.register(TYPES.GroupAdminService, { useValue: groupAdminServiceMock });
        container.register(TYPES.Logger, { useValue: loggerMock });

        controller = container.resolve(GroupAdminController);

        req = mock<Request>();
        res = mock<Response>();
        next = jest.fn();

        req.adminUser = adminUser;
        res.status.mockReturnThis();
        res.json.mockReturnThis();
        res.send.mockReturnThis();
    });

    afterEach(() => {
        container.clearInstances();
        jest.clearAllMocks();
    });

    describe('createGroup', () => {
        it('should create a group and return 201 status', async () => {
            const groupDetails = { groupName: 'new-group', description: 'A new group' };
            req.body = groupDetails;
            const createdGroup = new Group(groupDetails.groupName, groupDetails.description, 'ACTIVE', 0, new Date(), new Date());
            groupAdminServiceMock.createGroup.mockResolvedValue(createdGroup);

            await controller.createGroup(req, res, next);

            expect(groupAdminServiceMock.createGroup).toHaveBeenCalledWith(adminUser, groupDetails);
            expect(res.status).toHaveBeenCalledWith(HttpStatusCode.CREATED);
            expect(res.json).toHaveBeenCalledWith(createdGroup);
        });

        it('should call next with error if service throws', async () => {
            const error = new Error('test error');
            req.body = { groupName: 'new-group' };
            groupAdminServiceMock.createGroup.mockRejectedValue(error);

            await controller.createGroup(req, res, next);

            expect(next).toHaveBeenCalledWith(error);
        });
    });

    describe('getGroup', () => {
        it('should get a group and return 200 status', async () => {
            const groupName = 'test-group';
            req.params = { groupName };
            const group = new Group(groupName, 'description', 'ACTIVE', 0, new Date(), new Date());
            groupAdminServiceMock.getGroup.mockResolvedValue(group);

            await controller.getGroup(req, res, next);

            expect(groupAdminServiceMock.getGroup).toHaveBeenCalledWith(adminUser, groupName);
            expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
            expect(res.json).toHaveBeenCalledWith(group);
        });

        it('should call next with a NotFoundError if group not found', async () => {
            const groupName = 'not-found';
            req.params = { groupName };
            groupAdminServiceMock.getGroup.mockResolvedValue(null);

            await controller.getGroup(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.objectContaining({ name: 'NotFoundError' }));
        });
    });

    describe('listGroups', () => {
        it('should list groups and return 200 status', async () => {
            req.query = { limit: '10' };
            const groups = { groups: [], nextToken: 'token' };
            groupAdminServiceMock.listGroups.mockResolvedValue(groups);

            await controller.listGroups(req, res, next);

            expect(groupAdminServiceMock.listGroups).toHaveBeenCalledWith(adminUser, 10, undefined);
            expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
            expect(res.json).toHaveBeenCalledWith(groups);
        });
    });

    describe('deleteGroup', () => {
        it('should delete a group and return 204 status', async () => {
            const groupName = 'test-group';
            req.params = { groupName };
            groupAdminServiceMock.deleteGroup.mockResolvedValue();

            await controller.deleteGroup(req, res, next);

            expect(groupAdminServiceMock.deleteGroup).toHaveBeenCalledWith(adminUser, groupName);
            expect(res.status).toHaveBeenCalledWith(HttpStatusCode.NO_CONTENT);
            expect(res.send).toHaveBeenCalled();
        });
    });

    describe('assignRoleToGroup', () => {
        it('should assign a role to a group and return 200 status', async () => {
            const groupName = 'test-group';
            const roleName = 'test-role';
            req.params = { groupName };
            req.body = { roleName };
            groupAdminServiceMock.assignRoleToGroup.mockResolvedValue();

            await controller.assignRoleToGroup(req, res, next);

            expect(groupAdminServiceMock.assignRoleToGroup).toHaveBeenCalledWith(adminUser, groupName, roleName);
            expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
        });
    });

    describe('removeRoleFromGroup', () => {
        it('should remove a role from a group and return 204 status', async () => {
            const groupName = 'test-group';
            const roleName = 'test-role';
            req.params = { groupName, roleName };
            groupAdminServiceMock.removeRoleFromGroup.mockResolvedValue();

            await controller.removeRoleFromGroup(req, res, next);

            expect(groupAdminServiceMock.removeRoleFromGroup).toHaveBeenCalledWith(adminUser, groupName, roleName);
            expect(res.status).toHaveBeenCalledWith(HttpStatusCode.NO_CONTENT);
            expect(res.send).toHaveBeenCalled();
        });
    });

    describe('listRolesForGroup', () => {
        it('should list roles for a group and return 200 status', async () => {
            const groupName = 'test-group';
            req.params = { groupName };
            const roles = ['role1', 'role2'];
            groupAdminServiceMock.listRolesForGroup.mockResolvedValue(roles);

            await controller.listRolesForGroup(req, res, next);

            expect(groupAdminServiceMock.listRolesForGroup).toHaveBeenCalledWith(adminUser, groupName);
            expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
            expect(res.json).toHaveBeenCalledWith({ roles });
        });
    });
});