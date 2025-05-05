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
            permissionRepo.delete.mockResolvedValue(true); // Permission found and deleted
            assignmentRepo.removeAllAssignmentsForPermission.mockResolvedValue(undefined); // Cleanup success

            await service.deletePermission(mockAdminUser, permName);

            expect(permissionRepo.delete).toHaveBeenCalledWith(permName);
            expect(assignmentRepo.removeAllAssignmentsForPermission).toHaveBeenCalledWith(permName); // Verify cleanup called
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Successfully cleaned up assignments for deleted permission ${permName}`), expect.any(Object));
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Admin Successfully deleted permission '${permName}' and cleaned up assignments`), expect.any(Object));
            expect(logger.error).not.toHaveBeenCalled();
        });
    
        it('should throw PermissionNotFoundError if repo.delete returns false', async () => {
            permissionRepo.delete.mockResolvedValue(false);
            await expect(service.deletePermission(mockAdminUser, permName))
                .rejects.toThrow(PermissionNotFoundError);
            expect(assignmentRepo.removeAllAssignmentsForPermission).not.toHaveBeenCalled();
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Permission not found for deletion'), expect.any(Object));
        });

        it('should throw error and log if removeAllAssignments fails', async () => {
            permissionRepo.delete.mockResolvedValue(true); // Permission deleted successfully
            const cleanupError = new Error("Cleanup failed");
            assignmentRepo.removeAllAssignmentsForPermission.mockRejectedValue(cleanupError); // Cleanup fails

            await expect(service.deletePermission(mockAdminUser, permName))
                .rejects.toThrow(BaseError); // Expect the wrapped error from service
            await expect(service.deletePermission(mockAdminUser, permName))
                 .rejects.toHaveProperty('name', 'CleanupFailedError'); // Check the specific error name
            await expect(service.deletePermission(mockAdminUser, permName))
                 .rejects.toThrow(/failed to remove associated assignments/); // Check message

            expect(permissionRepo.delete).toHaveBeenCalledWith(permName);
            expect(assignmentRepo.removeAllAssignmentsForPermission).toHaveBeenCalledWith(permName);
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Permission ${permName} deleted from repository`), expect.any(Object));
             // Check specific error log
            expect(logger.error).toHaveBeenCalledWith(
                expect.stringContaining(`Failed to cleanup assignments for deleted permission ${permName}`),
                expect.objectContaining({ error: cleanupError })
            );
            // Final overall success log should NOT be called
            expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining(`Successfully deleted permission '${permName}' and cleaned up assignments`), expect.any(Object));
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