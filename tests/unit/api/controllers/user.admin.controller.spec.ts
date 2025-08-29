import 'reflect-metadata';
import { container } from 'tsyringe';
import { UserAdminController } from '../../../../src/api/controllers/user.admin.controller';
import { Request, Response, NextFunction } from 'express';
import { mock, MockProxy } from 'jest-mock-extended';
import { TYPES } from '../../../../src/shared/constants/types';
import { AdminUser } from '../../../../src/shared/types/admin-user.interface';
import { HttpStatusCode } from '../../../../src/application/enums/HttpStatusCode';
import { userAdminServiceMock } from '../../../mocks/userAdminService.mock';
import { loggerMock } from '../../../mocks/logger.mock';

describe('UserAdminController', () => {
    let controller: UserAdminController;
    let req: MockProxy<Request>;
    let res: MockProxy<Response>;
    let next: MockProxy<NextFunction>;

    const adminUser: AdminUser = { id: 'admin-id', username: 'admin', roles: ['admin'] };

    beforeEach(() => {
        container.register(TYPES.UserAdminService, { useValue: userAdminServiceMock });
        container.register(TYPES.Logger, { useValue: loggerMock });

        controller = container.resolve(UserAdminController);

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

    describe('createUser', () => {
        it('should create a user and return 201 status', async () => {
            const userDetails = { username: 'test', email: 'test@test.com' };
            req.body = userDetails;
            const createdUser = { id: '1', ...userDetails };
            userAdminServiceMock.createUser.mockResolvedValue(createdUser as any);

            await controller.createUser(req, res, next);

            expect(userAdminServiceMock.createUser).toHaveBeenCalledWith(adminUser, userDetails);
            expect(res.status).toHaveBeenCalledWith(HttpStatusCode.CREATED);
            expect(res.json).toHaveBeenCalledWith(createdUser);
        });

        it('should call next with error if service throws', async () => {
            const error = new Error('test error');
            req.body = { username: 'test', email: 'test@test.com' };
            userAdminServiceMock.createUser.mockRejectedValue(error);

            await controller.createUser(req, res, next);

            expect(next).toHaveBeenCalledWith(error);
        });
    });

    describe('getUser', () => {
        it('should get a user and return 200 status', async () => {
            const username = 'test-user';
            req.params = { username };
            const user = { id: '1', username };
            userAdminServiceMock.getUser.mockResolvedValue(user as any);

            await controller.getUser(req, res, next);

            expect(userAdminServiceMock.getUser).toHaveBeenCalledWith(adminUser, username);
            expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
            expect(res.json).toHaveBeenCalledWith(user);
        });

        it('should return 404 if user not found', async () => {
            const username = 'not-found';
            req.params = { username };
            userAdminServiceMock.getUser.mockResolvedValue(null);

            await controller.getUser(req, res, next);

            expect(res.status).toHaveBeenCalledWith(HttpStatusCode.NOT_FOUND);
        });
    });

    describe('listUsers', () => {
        it('should list users and return 200 status', async () => {
            req.query = { limit: '10', filter: 'test' };
            const users = { users: [], paginationToken: 'token' };
            userAdminServiceMock.listUsers.mockResolvedValue(users);

            await controller.listUsers(req, res, next);

            expect(userAdminServiceMock.listUsers).toHaveBeenCalledWith(adminUser, { limit: 10, filter: 'test' });
            expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
            expect(res.json).toHaveBeenCalledWith(users);
        });
    });

    describe('updateUserAttributes', () => {
        it('should update user attributes and return 204 status', async () => {
            const username = 'test-user';
            const attributes = { email: 'new@test.com' };
            req.params = { username };
            req.body = { attributesToUpdate: attributes };
            userAdminServiceMock.updateUserAttributes.mockResolvedValue();

            await controller.updateUserAttributes(req, res, next);

            expect(userAdminServiceMock.updateUserAttributes).toHaveBeenCalledWith(adminUser, { username, attributesToUpdate: attributes });
            expect(res.status).toHaveBeenCalledWith(HttpStatusCode.NO_CONTENT);
            expect(res.send).toHaveBeenCalled();
        });
    });

    describe('disableUser', () => {
        it('should disable a user and return 204 status', async () => {
            const username = 'test-user';
            req.params = { username };
            userAdminServiceMock.disableUser.mockResolvedValue();

            await controller.disableUser(req, res, next);

            expect(userAdminServiceMock.disableUser).toHaveBeenCalledWith(adminUser, username);
            expect(res.status).toHaveBeenCalledWith(HttpStatusCode.NO_CONTENT);
            expect(res.send).toHaveBeenCalled();
        });
    });

    describe('enableUser', () => {
        it('should enable a user and return 200 status', async () => {
            const username = 'test-user';
            req.params = { username };
            userAdminServiceMock.enableUser.mockResolvedValue();

            await controller.enableUser(req, res, next);

            expect(userAdminServiceMock.enableUser).toHaveBeenCalledWith(adminUser, username);
            expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
        });
    });
});