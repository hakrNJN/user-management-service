
import 'reflect-metadata';
import { container } from 'tsyringe';
import { PermissionAdminService } from '../../../../src/application/services/permission.admin.service';
import { IPermissionRepository } from '../../../../src/application/interfaces/IPermissionRepository';
import { IAssignmentRepository } from '../../../../src/application/interfaces/IAssignmentRepository';
import { ILogger } from '../../../../src/application/interfaces/ILogger';
import { AdminUser } from '../../../../src/shared/types/admin-user.interface';
import { TYPES } from '../../../../src/shared/constants/types';
import { Permission } from '../../../../src/domain/entities/Permission';
import { PermissionNotFoundError, PermissionExistsError } from '../../../../src/domain/exceptions/UserManagementError';
import { BaseError } from '../../../../src/shared/errors/BaseError';

describe('PermissionAdminService', () => {
    let service: PermissionAdminService;
    let permissionRepoMock: jest.Mocked<IPermissionRepository>;
    let assignmentRepoMock: jest.Mocked<IAssignmentRepository>;
    let loggerMock: jest.Mocked<ILogger>;

    const adminUser: AdminUser = {
        id: 'admin-id', tenantId: 'test-tenant',
        username: 'admin-user',
        roles: ['admin'],
    };

    const permissionName = 'test-permission';
    const permissionEntity = new Permission('test-tenant', permissionName, 'A test permission');

    beforeEach(() => {
        permissionRepoMock = {
            create: jest.fn(),
            findByName: jest.fn(),
            list: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
        } as any;

        assignmentRepoMock = {
            removeAllAssignmentsForPermission: jest.fn(),
            findRolesByPermissionName: jest.fn(),
        } as any;

        loggerMock = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
        };

        container.register(TYPES.PermissionRepository, { useValue: permissionRepoMock });
        container.register(TYPES.AssignmentRepository, { useValue: assignmentRepoMock });
        container.register(TYPES.Logger, { useValue: loggerMock });

        service = container.resolve(PermissionAdminService);
    });

    afterEach(() => {
        container.clearInstances();
        jest.clearAllMocks();
    });

    describe('createPermission', () => {
        it('should create a permission successfully', async () => {
            const details = { permissionName: 'new-permission', description: 'A new permission' };
            permissionRepoMock.create.mockResolvedValue();

            const result = await service.createPermission(adminUser, details);

            expect(permissionRepoMock.create).toHaveBeenCalledWith(expect.any(Permission));
            expect(result).toBeInstanceOf(Permission);
            expect(result.permissionName).toBe('new-permission');
        });

        it('should throw PermissionExistsError if permission already exists', async () => {
            const details = { permissionName: 'existing-permission' };
            permissionRepoMock.create.mockRejectedValue(new PermissionExistsError(details.permissionName));

            await expect(service.createPermission(adminUser, details)).rejects.toThrow(PermissionExistsError);
        });
    });

    describe('getPermission', () => {
        it('should return a permission if found', async () => {
            permissionRepoMock.findByName.mockResolvedValue(permissionEntity);

            const result = await service.getPermission(adminUser, permissionName);

            expect(permissionRepoMock.findByName).toHaveBeenCalledWith('test-tenant', permissionName);
            expect(result).toEqual(permissionEntity);
        });

        it('should return null if permission not found', async () => {
            permissionRepoMock.findByName.mockResolvedValue(null);

            const result = await service.getPermission(adminUser, permissionName);

            expect(result).toBeNull();
        });
    });

    describe('listPermissions', () => {
        it('should list permissions', async () => {
            const permissions = { items: [permissionEntity], total: 1 };
            permissionRepoMock.list.mockResolvedValue(permissions);

            const result = await service.listPermissions(adminUser, {});

            expect(permissionRepoMock.list).toHaveBeenCalledWith('test-tenant', {});
            expect(result).toEqual(permissions);
        });
    });

    describe('updatePermission', () => {
        it('should update a permission successfully', async () => {
            const updates = { description: 'Updated description' };
            const updatedPermission = new Permission('test-tenant', permissionName, updates.description);
            permissionRepoMock.update.mockResolvedValue(updatedPermission);

            const result = await service.updatePermission(adminUser, permissionName, updates);

            expect(permissionRepoMock.update).toHaveBeenCalledWith('test-tenant', permissionName, updates);
            expect(result).toEqual(updatedPermission);
        });
    });

    describe('deletePermission', () => {
        it('should delete a permission and its assignments successfully', async () => {
            permissionRepoMock.delete.mockResolvedValue(true);
            assignmentRepoMock.removeAllAssignmentsForPermission.mockResolvedValue();

            await service.deletePermission(adminUser, permissionName);

            expect(permissionRepoMock.delete).toHaveBeenCalledWith('test-tenant', permissionName);
            expect(assignmentRepoMock.removeAllAssignmentsForPermission).toHaveBeenCalledWith('test-tenant', permissionName);
        });

        it('should throw PermissionNotFoundError if permission does not exist', async () => {
            permissionRepoMock.delete.mockResolvedValue(false);

            await expect(service.deletePermission(adminUser, permissionName)).rejects.toThrow(PermissionNotFoundError);
        });

        it('should throw CleanupFailedError if assignment cleanup fails', async () => {
            permissionRepoMock.delete.mockResolvedValue(true);
            const error = new Error('Cleanup failed');
            assignmentRepoMock.removeAllAssignmentsForPermission.mockRejectedValue(error);

            await expect(service.deletePermission(adminUser, permissionName)).rejects.toThrow(BaseError);
            await expect(service.deletePermission(adminUser, permissionName)).rejects.toHaveProperty('name', 'CleanupFailedError');
        });
    });

    describe('listRolesForPermission', () => {
        it('should list roles for a permission', async () => {
            const roles = ['role1', 'role2'];
            permissionRepoMock.findByName.mockResolvedValue(permissionEntity);
            assignmentRepoMock.findRolesByPermissionName.mockResolvedValue(roles);

            const result = await service.listRolesForPermission(adminUser, permissionName);

            expect(result).toEqual(roles);
        });

        it('should throw PermissionNotFoundError if permission does not exist', async () => {
            permissionRepoMock.findByName.mockResolvedValue(null);

            await expect(service.listRolesForPermission(adminUser, permissionName)).rejects.toThrow(PermissionNotFoundError);
        });
    });

    describe('Permissions', () => {
        it('should throw ForbiddenError if admin user does not have required role', async () => {
            const nonAdminUser: AdminUser = {
                id: 'non-admin', tenantId: 'test-tenant',
                username: 'non-admin-user', roles: ['viewer']
            };
            const details = { permissionName: 'new-permission' };

            await expect(service.createPermission(nonAdminUser, details)).rejects.toThrow(BaseError);
            await expect(service.createPermission(nonAdminUser, details)).rejects.toHaveProperty('statusCode', 403);
        });
    });
});
