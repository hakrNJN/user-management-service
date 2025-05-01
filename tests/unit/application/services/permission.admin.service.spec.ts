// tests/unit/application/services/permission.admin.service.spec.ts

import { IAssignmentRepository } from '../../../../src/application/interfaces/IAssignmentRepository';
import { ILogger } from '../../../../src/application/interfaces/ILogger';
import { IPermissionRepository } from '../../../../src/application/interfaces/IPermissionRepository';
import { PermissionAdminService } from '../../../../src/application/services/permission.admin.service';
import { Permission } from '../../../../src/domain/entities/Permission';
import { PermissionExistsError, PermissionNotFoundError } from '../../../../src/domain/exceptions/UserManagementError';
import { BaseError } from '../../../../src/shared/errors/BaseError';
import { mockAdminUser, mockNonAdminUser } from '../../../mocks/adminUser.mock';
import { mockLogger } from '../../../mocks/logger.mock';
import { mockAssignmentRepository, mockPermissionRepository } from '../../../mocks/repository.mock';

describe('PermissionAdminService', () => {
    let service: PermissionAdminService;
    let permissionRepo: jest.Mocked<IPermissionRepository>;
    let assignmentRepo: jest.Mocked<IAssignmentRepository>;
    let logger: jest.Mocked<ILogger>;

    beforeEach(() => {
        jest.clearAllMocks();
        permissionRepo = { ...mockPermissionRepository } as jest.Mocked<IPermissionRepository>;
        assignmentRepo = { ...mockAssignmentRepository } as jest.Mocked<IAssignmentRepository>;
        logger = { ...mockLogger } as jest.Mocked<ILogger>;
        service = new PermissionAdminService(permissionRepo, assignmentRepo, logger);
    });

    // --- createPermission ---
    describe('createPermission', () => {
        const permDetails = { permissionName: 'doc:create', description: 'Create documents' };
        const newPerm = new Permission(permDetails.permissionName, permDetails.description);

        it('should call permissionRepo.create and return Permission', async () => {
            permissionRepo.create.mockResolvedValue(undefined);
            const result = await service.createPermission(mockAdminUser, permDetails);
            expect(result).toBeInstanceOf(Permission);
            expect(result.permissionName).toBe(permDetails.permissionName);
            expect(permissionRepo.create).toHaveBeenCalledWith(expect.objectContaining(permDetails));
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('successfully created permission'), expect.any(Object));
        });

        it('should throw ForbiddenError if admin lacks permission', async () => {
            await expect(service.createPermission(mockNonAdminUser, permDetails)).rejects.toHaveProperty('statusCode', 403);
            expect(permissionRepo.create).not.toHaveBeenCalled();
        });

        it('should re-throw PermissionExistsError from repository', async () => {
            const error = new PermissionExistsError(permDetails.permissionName);
            permissionRepo.create.mockRejectedValue(error);
            await expect(service.createPermission(mockAdminUser, permDetails))
                .rejects.toThrow(PermissionExistsError);
        });
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

        it('should throw ForbiddenError if admin lacks permission', async () => {
            await expect(service.getPermission(mockNonAdminUser, permName)).rejects.toHaveProperty('statusCode', 403);
        });
    });

    // --- listPermissions ---
    describe('listPermissions', () => {
        const mockPerms = [new Permission('p1'), new Permission('p2')];
        const mockResult = { items: mockPerms, lastEvaluatedKey: { pk: 'a', sk: 'b' } };

        it('should call permissionRepo.list and return result', async () => {
            permissionRepo.list.mockResolvedValue(mockResult);
            const options = { limit: 5 };
            const result = await service.listPermissions(mockAdminUser, options);
            expect(result).toEqual(mockResult);
            expect(permissionRepo.list).toHaveBeenCalledWith(options);
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('successfully listed 2 permissions'), expect.any(Object));
        });

        it('should throw ForbiddenError if admin lacks permission', async () => {
            await expect(service.listPermissions(mockNonAdminUser)).rejects.toHaveProperty('statusCode', 403);
        });
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

        it('should throw ForbiddenError if admin lacks permission', async () => {
            await expect(service.updatePermission(mockNonAdminUser, permName, updates)).rejects.toHaveProperty('statusCode', 403);
        });
    });

    // --- deletePermission ---
    describe('deletePermission', () => {
        const permName = 'doc:delete';

        it('should call permissionRepo.delete and assignmentRepo.removeAllAssignmentsForPermission', async () => {
            // Mock repo delete success
            permissionRepo.delete.mockResolvedValue(true);
            // FIX: Explicitly mock assignmentRepo cleanup success for this test case
            assignmentRepo.removeAllAssignmentsForPermission.mockResolvedValue(undefined);

            // Execute the service method
            await service.deletePermission(mockAdminUser, permName);

            // Verify calls were made
            expect(permissionRepo.delete).toHaveBeenCalledWith(permName);
            expect(assignmentRepo.removeAllAssignmentsForPermission).toHaveBeenCalledWith(permName);

            // Verify the FINAL success log message was called
            expect(logger.info).toHaveBeenCalledWith(
                expect.stringContaining(`Admin successfully deleted permission '${permName}' and cleaned up assignments`),
                expect.objectContaining({ adminUserId: mockAdminUser.id })
            );

            // Verify intermediate logs were also called (optional but good for debugging)
            expect(logger.info).toHaveBeenCalledWith(
                expect.stringContaining(`Admin attempting to delete permission ${permName}`),
                expect.any(Object)
            );
            expect(logger.info).toHaveBeenCalledWith(
                expect.stringContaining(`Permission ${permName} deleted from repository, attempting assignment cleanup...`),
                expect.any(Object)
            );
            expect(logger.info).toHaveBeenCalledWith(
                expect.stringContaining(`Successfully cleaned up assignments for deleted permission ${permName}`),
                expect.any(Object)
            );

            // Ensure no error logs were generated in the success path
            expect(logger.error).not.toHaveBeenCalled();
            expect(logger.warn).not.toHaveBeenCalled(); // Except maybe the checkAdminPermission debug log if level allows

            // Check total info calls if needed (e.g., 4 = attempt, deleted, cleanup done, final success)
            expect(logger.info).toHaveBeenCalledTimes(4); // Adjust if logging changes
        });
        it('should throw PermissionNotFoundError if repo.delete returns false', async () => {
            permissionRepo.delete.mockResolvedValue(false);
            await expect(service.deletePermission(mockAdminUser, permName))
                .rejects.toThrow(PermissionNotFoundError);
            expect(assignmentRepo.removeAllAssignmentsForPermission).not.toHaveBeenCalled();
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Permission not found for deletion'), expect.any(Object));
        });

        it('should throw error if removeAllAssignments fails', async () => {
            permissionRepo.delete.mockResolvedValue(true);
            const cleanupError = new Error("Cleanup failed");
            assignmentRepo.removeAllAssignmentsForPermission.mockRejectedValue(cleanupError);
            await expect(service.deletePermission(mockAdminUser, permName))
                .rejects.toThrow(BaseError); // Expect wrapped error
            await expect(service.deletePermission(mockAdminUser, permName))
                .rejects.toThrow(/Permission doc:delete was deleted, but failed to remove associated assignments/);
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to cleanup assignments'), expect.objectContaining({ error: cleanupError }));
        });

        it('should throw ForbiddenError if admin lacks permission', async () => {
            await expect(service.deletePermission(mockNonAdminUser, permName)).rejects.toHaveProperty('statusCode', 403);
            expect(permissionRepo.delete).not.toHaveBeenCalled();
        });
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

        it('should throw ForbiddenError if admin lacks permission', async () => {
            await expect(service.listRolesForPermission(mockNonAdminUser, permName)).rejects.toHaveProperty('statusCode', 403);
            expect(permissionRepo.findByName).not.toHaveBeenCalled();
            expect(assignmentRepo.findRolesByPermissionName).not.toHaveBeenCalled();
        });
    });
});