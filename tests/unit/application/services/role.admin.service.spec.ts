
import 'reflect-metadata';
import { container } from 'tsyringe';
import { RoleAdminService } from '../../../../src/application/services/role.admin.service';
import { IRoleRepository } from '../../../../src/application/interfaces/IRoleRepository';
import { IAssignmentRepository } from '../../../../src/application/interfaces/IAssignmentRepository';
import { IPermissionRepository } from '../../../../src/application/interfaces/IPermissionRepository';
import { ILogger } from '../../../../src/application/interfaces/ILogger';
import { AdminUser } from '../../../../src/shared/types/admin-user.interface';
import { TYPES } from '../../../../src/shared/constants/types';
import { Role } from '../../../../src/domain/entities/Role';
import { Permission } from '../../../../src/domain/entities/Permission';
import { RoleNotFoundError, PermissionNotFoundError, AssignmentError, RoleExistsError } from '../../../../src/domain/exceptions/UserManagementError';
import { BaseError } from '../../../../src/shared/errors/BaseError';

describe('RoleAdminService', () => {
    let service: RoleAdminService;
    let roleRepoMock: jest.Mocked<IRoleRepository>;
    let assignmentRepoMock: jest.Mocked<IAssignmentRepository>;
    let permissionRepoMock: jest.Mocked<IPermissionRepository>;
    let loggerMock: jest.Mocked<ILogger>;

    const adminUser: AdminUser = {
        id: 'admin-id', tenantId: 'test-tenant',
        username: 'admin-user',
        roles: ['admin'],
    };

    const roleName = 'test-role';
    const roleEntity = new Role('test-tenant', roleName, 'A test role');

    beforeEach(() => {
        roleRepoMock = {
            create: jest.fn(),
            findByName: jest.fn(),
            list: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
        } as any;

        assignmentRepoMock = {
            removeAllAssignmentsForRole: jest.fn(),
            assignPermissionToRole: jest.fn(),
            removePermissionFromRole: jest.fn(),
            findPermissionsByRoleName: jest.fn(),
        } as any;

        permissionRepoMock = {
            findByName: jest.fn(),
        } as any;

        loggerMock = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
        };

        container.register(TYPES.RoleRepository, { useValue: roleRepoMock });
        container.register(TYPES.AssignmentRepository, { useValue: assignmentRepoMock });
        container.register(TYPES.PermissionRepository, { useValue: permissionRepoMock });
        container.register(TYPES.Logger, { useValue: loggerMock });

        service = container.resolve(RoleAdminService);
    });

    afterEach(() => {
        container.clearInstances();
        jest.clearAllMocks();
    });

    describe('createRole', () => {
        it('should create a role successfully', async () => {
            const details = { roleName: 'new-role', description: 'A new role' };
            roleRepoMock.create.mockResolvedValue();

            const result = await service.createRole(adminUser, details);

            expect(roleRepoMock.create).toHaveBeenCalledWith(expect.any(Role));
            expect(result).toBeInstanceOf(Role);
            expect(result.roleName).toBe('new-role');
        });

        it('should throw RoleExistsError if role already exists', async () => {
            const details = { roleName: 'existing-role', description: 'An existing role' };
            roleRepoMock.create.mockRejectedValue(new RoleExistsError(details.roleName));

            await expect(service.createRole(adminUser, details)).rejects.toThrow(RoleExistsError);
        });
    });

    describe('getRole', () => {
        it('should return a role if found', async () => {
            roleRepoMock.findByName.mockResolvedValue(roleEntity);

            const result = await service.getRole(adminUser, roleName);

            expect(roleRepoMock.findByName).toHaveBeenCalledWith('test-tenant', roleName);
            expect(result).toEqual(roleEntity);
        });

        it('should return null if role not found', async () => {
            roleRepoMock.findByName.mockResolvedValue(null);

            const result = await service.getRole(adminUser, roleName);

            expect(result).toBeNull();
        });
    });

    describe('listRoles', () => {
        it('should list roles', async () => {
            const roles = { items: [roleEntity], total: 1 };
            roleRepoMock.list.mockResolvedValue(roles);

            const result = await service.listRoles(adminUser, {});

            expect(roleRepoMock.list).toHaveBeenCalledWith('test-tenant', {});
            expect(result).toEqual(roles);
        });
    });

    describe('updateRole', () => {
        it('should update a role successfully', async () => {
            const updates = { description: 'Updated description' };
            const updatedRole = new Role('test-tenant', roleName, updates.description);
            roleRepoMock.update.mockResolvedValue(updatedRole);

            const result = await service.updateRole(adminUser, roleName, updates);

            expect(roleRepoMock.update).toHaveBeenCalledWith('test-tenant', roleName, updates);
            expect(result).toEqual(updatedRole);
        });
    });

    describe('deleteRole', () => {
        it('should delete a role and its assignments successfully', async () => {
            roleRepoMock.delete.mockResolvedValue(true);
            assignmentRepoMock.removeAllAssignmentsForRole.mockResolvedValue();

            await service.deleteRole(adminUser, roleName);

            expect(roleRepoMock.delete).toHaveBeenCalledWith('test-tenant', roleName);
            expect(assignmentRepoMock.removeAllAssignmentsForRole).toHaveBeenCalledWith('test-tenant', roleName);
        });

        it('should throw RoleNotFoundError if role does not exist', async () => {
            roleRepoMock.delete.mockResolvedValue(false);

            await expect(service.deleteRole(adminUser, roleName)).rejects.toThrow(RoleNotFoundError);
        });

        it('should throw CleanupFailedError if assignment cleanup fails', async () => {
            roleRepoMock.delete.mockResolvedValue(true);
            const error = new Error('Cleanup failed');
            assignmentRepoMock.removeAllAssignmentsForRole.mockRejectedValue(error);

            await expect(service.deleteRole(adminUser, roleName)).rejects.toThrow(BaseError);
            await expect(service.deleteRole(adminUser, roleName)).rejects.toHaveProperty('name', 'CleanupFailedError');
        });
    });

    describe('assignPermissionToRole', () => {
        const permissionName = 'test-permission';
        const permissionEntity = new Permission('test-tenant', permissionName, 'A test permission');

        it('should assign a permission to a role successfully', async () => {
            roleRepoMock.findByName.mockResolvedValue(roleEntity);
            permissionRepoMock.findByName.mockResolvedValue(permissionEntity);
            assignmentRepoMock.assignPermissionToRole.mockResolvedValue();

            await service.assignPermissionToRole(adminUser, roleName, permissionName);

            expect(assignmentRepoMock.assignPermissionToRole).toHaveBeenCalledWith('test-tenant', roleName, permissionName);
        });

        it('should throw RoleNotFoundError if role does not exist', async () => {
            roleRepoMock.findByName.mockResolvedValue(null);

            await expect(service.assignPermissionToRole(adminUser, roleName, permissionName)).rejects.toThrow(RoleNotFoundError);
        });

        it('should throw PermissionNotFoundError if permission does not exist', async () => {
            roleRepoMock.findByName.mockResolvedValue(roleEntity);
            permissionRepoMock.findByName.mockResolvedValue(null);

            await expect(service.assignPermissionToRole(adminUser, roleName, permissionName)).rejects.toThrow(PermissionNotFoundError);
        });
    });

    describe('removePermissionFromRole', () => {
        const permissionName = 'test-permission';

        it('should remove a permission from a role successfully', async () => {
            assignmentRepoMock.removePermissionFromRole.mockResolvedValue();

            await service.removePermissionFromRole(adminUser, roleName, permissionName);

            expect(assignmentRepoMock.removePermissionFromRole).toHaveBeenCalledWith('test-tenant', roleName, permissionName);
        });

        it('should throw AssignmentError on failure', async () => {
            const error = new Error('DB error');
            assignmentRepoMock.removePermissionFromRole.mockRejectedValue(error);

            await expect(service.removePermissionFromRole(adminUser, roleName, permissionName)).rejects.toThrow(AssignmentError);
        });
    });

    describe('listPermissionsForRole', () => {
        it('should list permissions for a role', async () => {
            const permissions = ['perm1', 'perm2'];
            roleRepoMock.findByName.mockResolvedValue(roleEntity);
            assignmentRepoMock.findPermissionsByRoleName.mockResolvedValue(permissions);

            const result = await service.listPermissionsForRole(adminUser, roleName);

            expect(result).toEqual(permissions);
        });

        it('should throw RoleNotFoundError if role does not exist', async () => {
            roleRepoMock.findByName.mockResolvedValue(null);

            await expect(service.listPermissionsForRole(adminUser, roleName)).rejects.toThrow(RoleNotFoundError);
        });
    });

    describe('Permissions', () => {
        it('should throw ForbiddenError if admin user does not have required role', async () => {
            const nonAdminUser: AdminUser = {
                id: 'non-admin', tenantId: 'test-tenant',
                username: 'non-admin-user', roles: ['viewer']
            };
            const details = { roleName: 'new-role', description: 'A new role' };

            await expect(service.createRole(nonAdminUser, details)).rejects.toThrow(BaseError);
            await expect(service.createRole(nonAdminUser, details)).rejects.toHaveProperty('statusCode', 403);
        });
    });
});
