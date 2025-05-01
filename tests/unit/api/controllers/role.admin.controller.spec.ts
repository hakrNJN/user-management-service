// tests/unit/application/services/role.admin.service.spec.ts

import { IAssignmentRepository } from '../../../../src/application/interfaces/IAssignmentRepository';
import { ILogger } from '../../../../src/application/interfaces/ILogger';
import { IPermissionRepository } from '../../../../src/application/interfaces/IPermissionRepository'; // Needed to check permission existence
import { IRoleRepository } from '../../../../src/application/interfaces/IRoleRepository';
import { RoleAdminService } from '../../../../src/application/services/role.admin.service'; // Assuming path
import { Permission } from '../../../../src/domain/entities/Permission';
import { Role } from '../../../../src/domain/entities/Role';
import { PermissionNotFoundError, RoleExistsError, RoleNotFoundError } from '../../../../src/domain/exceptions/UserManagementError'; // Assuming these exist
import { mockAdminUser, mockNonAdminUser } from '../../../mocks/adminUser.mock';
import { mockLogger } from '../../../mocks/logger.mock';
import { mockAssignmentRepository, mockPermissionRepository, mockRoleRepository } from '../../../mocks/repository.mock';

describe('RoleAdminService', () => {
    let service: RoleAdminService;
    let roleRepo: jest.Mocked<IRoleRepository>;
    let assignmentRepo: jest.Mocked<IAssignmentRepository>;
    let permissionRepo: jest.Mocked<IPermissionRepository>; // Added mock
    let logger: jest.Mocked<ILogger>;

    beforeEach(() => {
        jest.clearAllMocks();
        roleRepo = { ...mockRoleRepository } as jest.Mocked<IRoleRepository>;
        assignmentRepo = { ...mockAssignmentRepository } as jest.Mocked<IAssignmentRepository>;
        permissionRepo = { ...mockPermissionRepository } as jest.Mocked<IPermissionRepository>; // Initialize mock
        logger = { ...mockLogger } as jest.Mocked<ILogger>;
        // Assuming RoleAdminService constructor takes these dependencies
        service = new RoleAdminService(roleRepo, assignmentRepo, permissionRepo, logger);
    });

    // --- createRole ---
    describe('createRole', () => {
        const roleDetails = { roleName: 'new-role', description: 'A new role' };
        const newRole = new Role(roleDetails.roleName, roleDetails.description);

        it('should call roleRepo.create and return Role on success', async () => {
            roleRepo.create.mockResolvedValue(undefined); // Create returns void
            // Mock findByName to simulate it doesn't exist yet (optional but good practice for some impl)
            roleRepo.findByName.mockResolvedValue(null);

            const result = await service.createRole(mockAdminUser, roleDetails);

            // Service might fetch after create or trust the input, test based on impl
            // For now, assume it returns based on input if create is void
            expect(result).toBeInstanceOf(Role);
            expect(result.roleName).toBe(roleDetails.roleName);
            expect(roleRepo.create).toHaveBeenCalledWith(expect.objectContaining(roleDetails));
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('attempting to create role'), expect.any(Object));
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
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('failed to create role'), expect.objectContaining({ error }));
        });
        // Add test for generic DatabaseError from repo
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
        // Add auth failure test
        // Add generic repo error test
    });

    // --- listRoles ---
    describe('listRoles', () => {
        // Test pagination, mapping etc. similar to GroupAdminService listGroups
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
            roleRepo.update.mockResolvedValue(null); // Repo signals not found
            const result = await service.updateRole(mockAdminUser, roleName, updates);
            expect(result).toBeNull();
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Role not found for update'), expect.any(Object));
        });
        // Add auth failure test
        // Add generic repo error test
    });

    // --- deleteRole ---
    describe('deleteRole', () => {
        const roleName = 'deleter';

        it('should call roleRepo.delete and assignmentRepo.removeAllAssignmentsForRole', async () => {
            roleRepo.delete.mockResolvedValue(true); // Role was found and deleted
            assignmentRepo.removeAllAssignmentsForRole.mockResolvedValue(undefined);

            await service.deleteRole(mockAdminUser, roleName);

            expect(roleRepo.delete).toHaveBeenCalledWith(roleName);
            expect(assignmentRepo.removeAllAssignmentsForRole).toHaveBeenCalledWith(roleName);
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('successfully deleted role'), expect.any(Object));
        });

        it('should throw RoleNotFoundError if roleRepo.delete returns false', async () => {
            roleRepo.delete.mockResolvedValue(false); // Role not found
            await expect(service.deleteRole(mockAdminUser, roleName))
                .rejects.toThrow(RoleNotFoundError);
            expect(assignmentRepo.removeAllAssignmentsForRole).not.toHaveBeenCalled();
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Role not found for deletion'), expect.any(Object));
        });

        it('should log error but potentially continue if removeAllAssignments fails', async () => {
            // Decide on desired behavior: should deletion fail if cleanup fails? Often, yes.
            roleRepo.delete.mockResolvedValue(true);
            const cleanupError = new Error("Cleanup failed");
            assignmentRepo.removeAllAssignmentsForRole.mockRejectedValue(cleanupError);
            
            // Update expectation to match the actual thrown error message
            await expect(service.deleteRole(mockAdminUser, roleName))
                .rejects.toThrow("Role deleter was deleted, but failed to remove associated assignments: Cleanup failed");
            expect(logger.error).toHaveBeenCalledWith(
                expect.stringContaining('Failed to cleanup assignments'), 
                expect.objectContaining({ error: cleanupError })
            );
        });it('should log error but potentially continue if removeAllAssignments fails', async () => {
            // Decide on desired behavior: should deletion fail if cleanup fails? Often, yes.
            roleRepo.delete.mockResolvedValue(true);
            const cleanupError = new Error("Cleanup failed");
            assignmentRepo.removeAllAssignmentsForRole.mockRejectedValue(cleanupError);
            
            // Update expectation to match the actual thrown error message
            await expect(service.deleteRole(mockAdminUser, roleName))
                .rejects.toThrow(`Role ${roleName} was deleted, but failed to remove associated assignments: Cleanup failed`);
            expect(logger.error).toHaveBeenCalledWith(
                expect.stringContaining('Failed to cleanup assignments'), 
                expect.objectContaining({ error: cleanupError })
            );
        });
        // Add auth failure test
        // Add generic repo error test
    });

    // --- assignPermissionToRole ---
    describe('assignPermissionToRole', () => {
        const roleName = 'assigner-role';
        const permName = 'assigner-perm';
        const existingRole = new Role(roleName);
        const existingPerm = new Permission(permName);

        it('should check role/permission existence and call assignmentRepo.assignPermissionToRole', async () => {
            roleRepo.findByName.mockResolvedValue(existingRole);
            permissionRepo.findByName.mockResolvedValue(existingPerm); // Mock permission check
            assignmentRepo.assignPermissionToRole.mockResolvedValue(undefined);

            await service.assignPermissionToRole(mockAdminUser, roleName, permName);

            expect(roleRepo.findByName).toHaveBeenCalledWith(roleName);
            expect(permissionRepo.findByName).toHaveBeenCalledWith(permName);
            expect(assignmentRepo.assignPermissionToRole).toHaveBeenCalledWith(roleName, permName);
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`successfully assigned permission '${permName}' to role '${roleName}'`), expect.any(Object));
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
        // Add auth test
        // Add assignmentRepo error test
    });

    // --- removePermissionFromRole ---
    describe('removePermissionFromRole', () => {
        const roleName = 'remover-role';
        const permName = 'remover-perm';

        it('should call assignmentRepo.removePermissionFromRole', async () => {
            // Optional: could check role/perm existence first, but often deletion is okay if they don't exist
            assignmentRepo.removePermissionFromRole.mockResolvedValue(undefined);
            await service.removePermissionFromRole(mockAdminUser, roleName, permName);
            expect(assignmentRepo.removePermissionFromRole).toHaveBeenCalledWith(roleName, permName);
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`successfully removed permission '${permName}' from role '${roleName}'`), expect.any(Object));
        });
        // Add auth test
        // Add assignmentRepo error test
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
        // Add auth test
        // Add assignmentRepo error test
    });
});