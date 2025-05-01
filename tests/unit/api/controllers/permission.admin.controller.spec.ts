// tests/unit/application/services/permission.admin.service.spec.ts

import { IAssignmentRepository } from '../../../../src/application/interfaces/IAssignmentRepository';
import { ILogger } from '../../../../src/application/interfaces/ILogger';
import { IPermissionRepository } from '../../../../src/application/interfaces/IPermissionRepository';
import { PermissionAdminService } from '../../../../src/application/services/permission.admin.service'; // Assuming path
import { Permission } from '../../../../src/domain/entities/Permission';
import { PermissionExistsError, PermissionNotFoundError } from '../../../../src/domain/exceptions/UserManagementError';
import { mockAdminUser, mockNonAdminUser } from '../../../mocks/adminUser.mock';
import { mockLogger } from '../../../mocks/logger.mock';
import { mockAssignmentRepository, mockPermissionRepository } from '../../../mocks/repository.mock';

describe('PermissionAdminService', () => {
    let service: PermissionAdminService;
    let permissionRepo: jest.Mocked<IPermissionRepository>;
    let assignmentRepo: jest.Mocked<IAssignmentRepository>;
    // let roleRepo: jest.Mocked<IRoleRepository>; // Include if needed
    let logger: jest.Mocked<ILogger>;

    beforeEach(() => {
        jest.clearAllMocks();
        permissionRepo = { ...mockPermissionRepository } as jest.Mocked<IPermissionRepository>;
        assignmentRepo = { ...mockAssignmentRepository } as jest.Mocked<IAssignmentRepository>;
        // roleRepo = { ...mockRoleRepository } as jest.Mocked<IRoleRepository>;
        logger = { ...mockLogger } as jest.Mocked<ILogger>;
        // Assuming constructor takes these
        service = new PermissionAdminService(permissionRepo, assignmentRepo, logger);
    });

    // --- createPermission ---
    describe('createPermission', () => {
        const permDetails = { permissionName: 'doc:create', description: 'Create documents' };
        const newPerm = new Permission(permDetails.permissionName, permDetails.description);

        it('should call permissionRepo.create and return Permission', async () => {
            permissionRepo.create.mockResolvedValue(undefined);
            // Assume service returns based on input if create is void
            const result = await service.createPermission(mockAdminUser, permDetails);
            expect(result).toBeInstanceOf(Permission);
            expect(result.permissionName).toBe(permDetails.permissionName);
            expect(permissionRepo.create).toHaveBeenCalledWith(expect.objectContaining(permDetails));
        });

        it('should throw ForbiddenError if admin lacks permission', async () => {
            await expect(service.createPermission(mockNonAdminUser, permDetails))
                .rejects.toHaveProperty('statusCode', 403);
            expect(permissionRepo.create).not.toHaveBeenCalled();
        });

        it('should re-throw PermissionExistsError from repository', async () => {
            const error = new PermissionExistsError(permDetails.permissionName);
            permissionRepo.create.mockRejectedValue(error);
            await expect(service.createPermission(mockAdminUser, permDetails))
                .rejects.toThrow(PermissionExistsError);
        });
        // Add generic repo error test
    });

    // --- getPermission ---
    describe('getPermission', () => {
        const permName = 'doc:read';
        const existingPerm = new Permission(permName);

        it('should call permissionRepo.findByName and return Permission if found', async () => {
            permissionRepo.findByName.mockResolvedValue(existingPerm);
            const result = await service.getPermission(mockAdminUser, permName);
            expect(result).toEqual(existingPerm);
            expect(permissionRepo.findByName).toHaveBeenCalledWith(permName);
        });

        it('should return null if permission not found', async () => {
            permissionRepo.findByName.mockResolvedValue(null);
            const result = await service.getPermission(mockAdminUser, permName);
            expect(result).toBeNull();
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Permission not found'), expect.any(Object));
        });
        // Add auth failure test
        // Add generic repo error test
    });

    // --- listPermissions ---
    describe('listPermissions', () => {
        // Test similarly to listRoles / listGroups
    });

    // --- updatePermission ---
    describe('updatePermission', () => {
        const permName = 'doc:update';
        const updates = { description: 'Updated Desc' };
        const updatedPerm = new Permission(permName, updates.description);

        it('should call permissionRepo.update and return updated Permission', async () => {
            permissionRepo.update.mockResolvedValue(updatedPerm);
            const result = await service.updatePermission(mockAdminUser, permName, updates);
            expect(result).toEqual(updatedPerm);
            expect(permissionRepo.update).toHaveBeenCalledWith(permName, updates);
        });

        it('should return null if permission not found for update', async () => {
            permissionRepo.update.mockResolvedValue(null);
            const result = await service.updatePermission(mockAdminUser, permName, updates);
            expect(result).toBeNull();
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Permission not found for update'), expect.any(Object));
        });
        // Add auth failure test
        // Add generic repo error test
    });

    // --- deletePermission ---
    describe('deletePermission', () => {
        const permName = 'doc:delete';

        it('should call permissionRepo.delete and assignmentRepo.removeAllAssignmentsForPermission', async () => {
            permissionRepo.delete.mockResolvedValue(true);
            assignmentRepo.removeAllAssignmentsForPermission.mockResolvedValue(undefined);

            await service.deletePermission(mockAdminUser, permName);

            expect(permissionRepo.delete).toHaveBeenCalledWith(permName);
            expect(assignmentRepo.removeAllAssignmentsForPermission).toHaveBeenCalledWith(permName);
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Successfully deleted permission'), expect.any(Object));
        });

        it('should throw PermissionNotFoundError if repo.delete returns false', async () => {
            permissionRepo.delete.mockResolvedValue(false);
            await expect(service.deletePermission(mockAdminUser, permName))
                .rejects.toThrow(PermissionNotFoundError);
            expect(assignmentRepo.removeAllAssignmentsForPermission).not.toHaveBeenCalled();
        });

        // Add test for cleanup failure propagation (similar to Role service)
        // Add auth failure test
        // Add generic repo error test
    });

    // --- listRolesForPermission ---
    describe('listRolesForPermission', () => {
        const permName = 'doc:list';
        const existingPerm = new Permission(permName);
        const roles = ['role-x', 'role-y'];

        it('should check permission existence and return roles from assignmentRepo', async () => {
            permissionRepo.findByName.mockResolvedValue(existingPerm);
            assignmentRepo.findRolesByPermissionName.mockResolvedValue(roles);

            const result = await service.listRolesForPermission(mockAdminUser, permName);

            expect(result).toEqual(roles);
            expect(permissionRepo.findByName).toHaveBeenCalledWith(permName);
            expect(assignmentRepo.findRolesByPermissionName).toHaveBeenCalledWith(permName);
        });

        it('should throw PermissionNotFoundError if permission does not exist', async () => {
            permissionRepo.findByName.mockResolvedValue(null);
            await expect(service.listRolesForPermission(mockAdminUser, permName))
                .rejects.toThrow(PermissionNotFoundError);
            expect(assignmentRepo.findRolesByPermissionName).not.toHaveBeenCalled();
        });
        // Add auth test
        // Add assignmentRepo error test
    });
});