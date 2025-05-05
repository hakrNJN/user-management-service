// tests/unit/application/services/role.admin.service.spec.ts

import { IAssignmentRepository } from '../../../../src/application/interfaces/IAssignmentRepository';
import { ILogger } from '../../../../src/application/interfaces/ILogger';
import { IPermissionRepository } from '../../../../src/application/interfaces/IPermissionRepository';
import { IRoleRepository } from '../../../../src/application/interfaces/IRoleRepository';
import { RoleAdminService } from '../../../../src/application/services/role.admin.service';
import { Permission } from '../../../../src/domain/entities/Permission';
import { Role } from '../../../../src/domain/entities/Role';
import { AssignmentError, PermissionNotFoundError, RoleExistsError, RoleNotFoundError } from '../../../../src/domain/exceptions/UserManagementError';
import { BaseError } from '../../../../src/shared/errors/BaseError';
import { mockAdminUser, mockNonAdminUser } from '../../../mocks/adminUser.mock';
import { mockLogger } from '../../../mocks/logger.mock';
import { mockAssignmentRepository, mockPermissionRepository, mockRoleRepository } from '../../../mocks/repository.mock';

describe('RoleAdminService', () => {
    let service: RoleAdminService;
    let roleRepo: jest.Mocked<IRoleRepository>;
    let assignmentRepo: jest.Mocked<IAssignmentRepository>;
    let permissionRepo: jest.Mocked<IPermissionRepository>;
    let logger: jest.Mocked<ILogger>;

    beforeEach(() => {
        jest.clearAllMocks();
        roleRepo = { ...mockRoleRepository } as jest.Mocked<IRoleRepository>;
        assignmentRepo = { ...mockAssignmentRepository } as jest.Mocked<IAssignmentRepository>;
        permissionRepo = { ...mockPermissionRepository } as jest.Mocked<IPermissionRepository>;
        logger = { ...mockLogger } as jest.Mocked<ILogger>;
        service = new RoleAdminService(roleRepo, assignmentRepo, permissionRepo, logger);
    });

    // --- createRole ---
    describe('createRole', () => {
        const roleDetails = { roleName: 'new-role', description: 'A new role' };
        const newRole = new Role(roleDetails.roleName, roleDetails.description);

        it('should call roleRepo.create and return Role on success', async () => {
            roleRepo.create.mockResolvedValue(undefined);
            const result = await service.createRole(mockAdminUser, roleDetails);
            expect(result).toBeInstanceOf(Role);
            expect(result.roleName).toBe(roleDetails.roleName);
            expect(roleRepo.create).toHaveBeenCalledWith(expect.objectContaining(roleDetails));
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('successfully created role'), expect.any(Object));
        });

        it('should throw ForbiddenError if admin lacks permission', async () => {
            await expect(service.createRole(mockNonAdminUser, roleDetails))
                .rejects.toHaveProperty('statusCode', 403);
            expect(roleRepo.create).not.toHaveBeenCalled();
        });

        it('should re-throw RoleExistsError from repository', async () => {
            const error = new RoleExistsError(roleDetails.roleName);
            roleRepo.create.mockRejectedValue(error);
            await expect(service.createRole(mockAdminUser, roleDetails))
                .rejects.toThrow(RoleExistsError);
        });
    });

    // --- getRole ---
    describe('getRole', () => {
        const roleName = 'editor';
        const existingRole = new Role(roleName, 'Editor Role');

        it('should call roleRepo.findByName and return Role if found', async () => {
            roleRepo.findByName.mockResolvedValue(existingRole);
            const result = await service.getRole(mockAdminUser, roleName);
            expect(result).toEqual(existingRole);
            expect(roleRepo.findByName).toHaveBeenCalledWith(roleName);
        });

        it('should return null if role not found', async () => {
            roleRepo.findByName.mockResolvedValue(null);
            const result = await service.getRole(mockAdminUser, roleName);
            expect(result).toBeNull();
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Role not found'), expect.any(Object));
        });

        it('should throw ForbiddenError if admin lacks permission', async () => {
            await expect(service.getRole(mockNonAdminUser, roleName)).rejects.toHaveProperty('statusCode', 403);
        });
    });

    // --- listRoles ---
    describe('listRoles', () => {
        const mockRoles = [new Role('r1'), new Role('r2')];
        const mockResult = { items: mockRoles, lastEvaluatedKey: { pk: 'a', sk: 'b' } };

        it('should call roleRepo.list and return result', async () => {
            roleRepo.list.mockResolvedValue(mockResult);
            const options = { limit: 10 };
            const result = await service.listRoles(mockAdminUser, options);
            expect(result).toEqual(mockResult);
            expect(roleRepo.list).toHaveBeenCalledWith(options);
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('successfully listed 2 roles'), expect.any(Object));
        });

        it('should throw ForbiddenError if admin lacks permission', async () => {
            await expect(service.listRoles(mockNonAdminUser)).rejects.toHaveProperty('statusCode', 403);
        });
    });

    // --- updateRole ---
    describe('updateRole', () => {
        const roleName = 'updater';
        const updates = { description: 'New Description' };
        const updatedRole = new Role(roleName, updates.description);

        it('should call roleRepo.update and return updated Role', async () => {
            roleRepo.update.mockResolvedValue(updatedRole);
            const result = await service.updateRole(mockAdminUser, roleName, updates);
            expect(result).toEqual(updatedRole);
            expect(roleRepo.update).toHaveBeenCalledWith(roleName, updates);
        });

        it('should return null if role not found for update', async () => {
            roleRepo.update.mockResolvedValue(null);
            const result = await service.updateRole(mockAdminUser, roleName, updates);
            expect(result).toBeNull();
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Role not found for update'), expect.any(Object));
        });

        it('should throw ForbiddenError if admin lacks permission', async () => {
            await expect(service.updateRole(mockNonAdminUser, roleName, updates)).rejects.toHaveProperty('statusCode', 403);
        });
    });

    // --- deleteRole ---
    describe('deleteRole', () => {
        const roleName = 'deleter';

        it('should call roleRepo.delete and assignmentRepo.removeAllAssignmentsForRole on success', async () => {
            roleRepo.delete.mockResolvedValue(true); // Role found and deleted
            assignmentRepo.removeAllAssignmentsForRole.mockResolvedValue(undefined); // Cleanup success

            await service.deleteRole(mockAdminUser, roleName);

            expect(roleRepo.delete).toHaveBeenCalledWith(roleName);
            expect(assignmentRepo.removeAllAssignmentsForRole).toHaveBeenCalledWith(roleName); // Verify cleanup called
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Successfully cleaned up assignments for deleted role ${roleName}`), expect.any(Object));
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Admin successfully deleted role '${roleName}' and cleaned up assignments`), expect.any(Object));
            expect(logger.error).not.toHaveBeenCalled();
        });

        it('should throw RoleNotFoundError if roleRepo.delete returns false', async () => {
            roleRepo.delete.mockResolvedValue(false);
            await expect(service.deleteRole(mockAdminUser, roleName))
                .rejects.toThrow(RoleNotFoundError);
            expect(assignmentRepo.removeAllAssignmentsForRole).not.toHaveBeenCalled();
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Role not found for deletion'), expect.any(Object));
        });

        it('should throw error and log if removeAllAssignments fails', async () => {
            roleRepo.delete.mockResolvedValue(true); // Role deleted successfully
            const cleanupError = new Error("Cleanup failed");
            assignmentRepo.removeAllAssignmentsForRole.mockRejectedValue(cleanupError); // Cleanup fails

            await expect(service.deleteRole(mockAdminUser, roleName))
                .rejects.toThrow(BaseError); // Expect wrapped error
             await expect(service.deleteRole(mockAdminUser, roleName))
                 .rejects.toHaveProperty('name', 'CleanupFailedError'); // Check specific error name
             await expect(service.deleteRole(mockAdminUser, roleName))
                 .rejects.toThrow(/failed to remove associated assignments/); // Check message


            expect(roleRepo.delete).toHaveBeenCalledWith(roleName);
            expect(assignmentRepo.removeAllAssignmentsForRole).toHaveBeenCalledWith(roleName);
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Role ${roleName} deleted from repository`), expect.any(Object));
            // Check specific error log
            expect(logger.error).toHaveBeenCalledWith(
                expect.stringContaining(`Failed to cleanup assignments for deleted role ${roleName}`),
                expect.objectContaining({ error: cleanupError })
            );
             // Final overall success log should NOT be called
             expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining(`successfully deleted role '${roleName}' and cleaned up assignments`), expect.any(Object));
        });
        
        it('should throw ForbiddenError if admin lacks permission', async () => {
            await expect(service.deleteRole(mockNonAdminUser, roleName)).rejects.toHaveProperty('statusCode', 403);
            expect(roleRepo.delete).not.toHaveBeenCalled();
        });
    });

    // --- assignPermissionToRole ---
    describe('assignPermissionToRole', () => {
        const roleName = 'assigner-role';
        const permName = 'assigner-perm';
        const existingRole = new Role(roleName);
        const existingPerm = new Permission(permName);

        it('should check role/permission existence and call assignmentRepo.assignPermissionToRole', async () => {
            roleRepo.findByName.mockResolvedValue(existingRole);
            permissionRepo.findByName.mockResolvedValue(existingPerm);
            assignmentRepo.assignPermissionToRole.mockResolvedValue(undefined);
            await service.assignPermissionToRole(mockAdminUser, roleName, permName);
        
            expect(roleRepo.findByName).toHaveBeenCalledWith(roleName);
            expect(permissionRepo.findByName).toHaveBeenCalledWith(permName);
            expect(assignmentRepo.assignPermissionToRole).toHaveBeenCalledWith(roleName, permName);
        
            // FIX: Check for the specific success log
            expect(logger.info).toHaveBeenCalledWith(
                expect.stringContaining(`Admin successfully assigned permission '${permName}' to role '${roleName}'`),
                expect.objectContaining({ adminUserId: mockAdminUser.id })
            );
        });

        it('should throw RoleNotFoundError if role does not exist', async () => {
            roleRepo.findByName.mockResolvedValue(null);
            permissionRepo.findByName.mockResolvedValue(existingPerm);
            await expect(service.assignPermissionToRole(mockAdminUser, roleName, permName))
                .rejects.toThrow(RoleNotFoundError);
            expect(assignmentRepo.assignPermissionToRole).not.toHaveBeenCalled();
        });

        it('should throw PermissionNotFoundError if permission does not exist', async () => {
            roleRepo.findByName.mockResolvedValue(existingRole);
            permissionRepo.findByName.mockResolvedValue(null);
            await expect(service.assignPermissionToRole(mockAdminUser, roleName, permName))
                .rejects.toThrow(PermissionNotFoundError);
            expect(assignmentRepo.assignPermissionToRole).not.toHaveBeenCalled();
        });

        it('should throw ForbiddenError if admin lacks permission', async () => {
            await expect(service.assignPermissionToRole(mockNonAdminUser, roleName, permName)).rejects.toHaveProperty('statusCode', 403);
            expect(assignmentRepo.assignPermissionToRole).not.toHaveBeenCalled();
        });

        it('should throw AssignmentError if assignmentRepo fails', async () => {
            roleRepo.findByName.mockResolvedValue(existingRole);
            permissionRepo.findByName.mockResolvedValue(existingPerm);
            const assignError = new Error("DB assign failed");
            assignmentRepo.assignPermissionToRole.mockRejectedValue(assignError);

            await expect(service.assignPermissionToRole(mockAdminUser, roleName, permName))
                .rejects.toThrow(AssignmentError);
            await expect(service.assignPermissionToRole(mockAdminUser, roleName, permName))
                .rejects.toThrow(/Failed to assign permission/);
        });
    });

    // --- removePermissionFromRole ---
    describe('removePermissionFromRole', () => {
        const roleName = 'remover-role';
        const permName = 'remover-perm';

        it('should call assignmentRepo.removePermissionFromRole', async () => {
            assignmentRepo.removePermissionFromRole.mockResolvedValue(undefined);
            await service.removePermissionFromRole(mockAdminUser, roleName, permName);
            expect(assignmentRepo.removePermissionFromRole).toHaveBeenCalledWith(roleName, permName);
        
            // FIX: Check for the specific success log
            expect(logger.info).toHaveBeenCalledWith(
                expect.stringContaining(`Admin successfully removed permission '${permName}' from role '${roleName}'`),
                expect.objectContaining({ adminUserId: mockAdminUser.id })
            );
        });

        it('should throw ForbiddenError if admin lacks permission', async () => {
            await expect(service.removePermissionFromRole(mockNonAdminUser, roleName, permName)).rejects.toHaveProperty('statusCode', 403);
            expect(assignmentRepo.removePermissionFromRole).not.toHaveBeenCalled();
        });

        it('should throw AssignmentError if assignmentRepo fails', async () => {
            const removeError = new Error("DB remove failed");
            assignmentRepo.removePermissionFromRole.mockRejectedValue(removeError);
            await expect(service.removePermissionFromRole(mockAdminUser, roleName, permName))
                .rejects.toThrow(AssignmentError);
            await expect(service.removePermissionFromRole(mockAdminUser, roleName, permName))
                .rejects.toThrow(/Failed to remove permission/);
        });
    });

    // --- listPermissionsForRole ---
    describe('listPermissionsForRole', () => {
        const roleName = 'lister-role';
        const existingRole = new Role(roleName);
        const perms = ['perm1', 'perm2'];

        it('should check role existence and return permissions from assignmentRepo', async () => {
            roleRepo.findByName.mockResolvedValue(existingRole);
            assignmentRepo.findPermissionsByRoleName.mockResolvedValue(perms);
            const result = await service.listPermissionsForRole(mockAdminUser, roleName);
            expect(result).toEqual(perms);
            expect(roleRepo.findByName).toHaveBeenCalledWith(roleName);
            expect(assignmentRepo.findPermissionsByRoleName).toHaveBeenCalledWith(roleName);
        });

        it('should throw RoleNotFoundError if role does not exist', async () => {
            roleRepo.findByName.mockResolvedValue(null);
            await expect(service.listPermissionsForRole(mockAdminUser, roleName))
                .rejects.toThrow(RoleNotFoundError);
            expect(assignmentRepo.findPermissionsByRoleName).not.toHaveBeenCalled();
        });

        it('should throw ForbiddenError if admin lacks permission', async () => {
            await expect(service.listPermissionsForRole(mockNonAdminUser, roleName)).rejects.toHaveProperty('statusCode', 403);
            expect(roleRepo.findByName).not.toHaveBeenCalled(); // Check doesn't even happen
            expect(assignmentRepo.findPermissionsByRoleName).not.toHaveBeenCalled();
        });
    });
});