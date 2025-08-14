"use strict";
// tests/unit/application/services/permission.admin.service.spec.ts
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const permission_admin_service_1 = require("../../../../src/application/services/permission.admin.service");
const Permission_1 = require("../../../../src/domain/entities/Permission");
const UserManagementError_1 = require("../../../../src/domain/exceptions/UserManagementError");
const BaseError_1 = require("../../../../src/shared/errors/BaseError");
const adminUser_mock_1 = require("../../../mocks/adminUser.mock");
const logger_mock_1 = require("../../../mocks/logger.mock");
const repository_mock_1 = require("../../../mocks/repository.mock");
describe('PermissionAdminService', () => {
    let service;
    let permissionRepo;
    let assignmentRepo;
    let logger;
    beforeEach(() => {
        jest.clearAllMocks();
        permissionRepo = Object.assign({}, repository_mock_1.mockPermissionRepository);
        assignmentRepo = Object.assign({}, repository_mock_1.mockAssignmentRepository);
        logger = Object.assign({}, logger_mock_1.mockLogger);
        service = new permission_admin_service_1.PermissionAdminService(permissionRepo, assignmentRepo, logger);
    });
    // --- createPermission ---
    describe('createPermission', () => {
        const permDetails = { permissionName: 'doc:create', description: 'Create documents' };
        const newPerm = new Permission_1.Permission(permDetails.permissionName, permDetails.description);
        it('should call permissionRepo.create and return Permission', () => __awaiter(void 0, void 0, void 0, function* () {
            permissionRepo.create.mockResolvedValue(undefined);
            const result = yield service.createPermission(adminUser_mock_1.mockAdminUser, permDetails);
            expect(result).toBeInstanceOf(Permission_1.Permission);
            expect(result.permissionName).toBe(permDetails.permissionName);
            expect(permissionRepo.create).toHaveBeenCalledWith(expect.objectContaining(permDetails));
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('successfully created permission'), expect.any(Object));
        }));
        it('should throw ForbiddenError if admin lacks permission', () => __awaiter(void 0, void 0, void 0, function* () {
            yield expect(service.createPermission(adminUser_mock_1.mockNonAdminUser, permDetails)).rejects.toHaveProperty('statusCode', 403);
            expect(permissionRepo.create).not.toHaveBeenCalled();
        }));
        it('should re-throw PermissionExistsError from repository', () => __awaiter(void 0, void 0, void 0, function* () {
            const error = new UserManagementError_1.PermissionExistsError(permDetails.permissionName);
            permissionRepo.create.mockRejectedValue(error);
            yield expect(service.createPermission(adminUser_mock_1.mockAdminUser, permDetails))
                .rejects.toThrow(UserManagementError_1.PermissionExistsError);
        }));
    });
    // --- getPermission ---
    describe('getPermission', () => {
        const permName = 'doc:read';
        const existingPerm = new Permission_1.Permission(permName);
        it('should call permissionRepo.findByName and return Permission if found', () => __awaiter(void 0, void 0, void 0, function* () {
            permissionRepo.findByName.mockResolvedValue(existingPerm);
            const result = yield service.getPermission(adminUser_mock_1.mockAdminUser, permName);
            expect(result).toEqual(existingPerm);
            expect(permissionRepo.findByName).toHaveBeenCalledWith(permName);
        }));
        it('should return null if permission not found', () => __awaiter(void 0, void 0, void 0, function* () {
            permissionRepo.findByName.mockResolvedValue(null);
            const result = yield service.getPermission(adminUser_mock_1.mockAdminUser, permName);
            expect(result).toBeNull();
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Permission not found'), expect.any(Object));
        }));
        it('should throw ForbiddenError if admin lacks permission', () => __awaiter(void 0, void 0, void 0, function* () {
            yield expect(service.getPermission(adminUser_mock_1.mockNonAdminUser, permName)).rejects.toHaveProperty('statusCode', 403);
        }));
    });
    // --- listPermissions ---
    describe('listPermissions', () => {
        const mockPerms = [new Permission_1.Permission('p1'), new Permission_1.Permission('p2')];
        const mockResult = { items: mockPerms, lastEvaluatedKey: { pk: 'a', sk: 'b' } };
        it('should call permissionRepo.list and return result', () => __awaiter(void 0, void 0, void 0, function* () {
            permissionRepo.list.mockResolvedValue(mockResult);
            const options = { limit: 5 };
            const result = yield service.listPermissions(adminUser_mock_1.mockAdminUser, options);
            expect(result).toEqual(mockResult);
            expect(permissionRepo.list).toHaveBeenCalledWith(options);
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('successfully listed 2 permissions'), expect.any(Object));
        }));
        it('should throw ForbiddenError if admin lacks permission', () => __awaiter(void 0, void 0, void 0, function* () {
            yield expect(service.listPermissions(adminUser_mock_1.mockNonAdminUser)).rejects.toHaveProperty('statusCode', 403);
        }));
    });
    // --- updatePermission ---
    describe('updatePermission', () => {
        const permName = 'doc:update';
        const updates = { description: 'Updated Desc' };
        const updatedPerm = new Permission_1.Permission(permName, updates.description);
        it('should call permissionRepo.update and return updated Permission', () => __awaiter(void 0, void 0, void 0, function* () {
            permissionRepo.update.mockResolvedValue(updatedPerm);
            const result = yield service.updatePermission(adminUser_mock_1.mockAdminUser, permName, updates);
            expect(result).toEqual(updatedPerm);
            expect(permissionRepo.update).toHaveBeenCalledWith(permName, updates);
        }));
        it('should return null if permission not found for update', () => __awaiter(void 0, void 0, void 0, function* () {
            permissionRepo.update.mockResolvedValue(null);
            const result = yield service.updatePermission(adminUser_mock_1.mockAdminUser, permName, updates);
            expect(result).toBeNull();
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Permission not found for update'), expect.any(Object));
        }));
        it('should throw ForbiddenError if admin lacks permission', () => __awaiter(void 0, void 0, void 0, function* () {
            yield expect(service.updatePermission(adminUser_mock_1.mockNonAdminUser, permName, updates)).rejects.toHaveProperty('statusCode', 403);
        }));
    });
    // --- deletePermission ---
    describe('deletePermission', () => {
        const permName = 'doc:delete';
        it('should call permissionRepo.delete and assignmentRepo.removeAllAssignmentsForPermission', () => __awaiter(void 0, void 0, void 0, function* () {
            permissionRepo.delete.mockResolvedValue(true); // Permission found and deleted
            assignmentRepo.removeAllAssignmentsForPermission.mockResolvedValue(undefined); // Cleanup success
            yield service.deletePermission(adminUser_mock_1.mockAdminUser, permName);
            expect(permissionRepo.delete).toHaveBeenCalledWith(permName);
            expect(assignmentRepo.removeAllAssignmentsForPermission).toHaveBeenCalledWith(permName); // Verify cleanup called
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Successfully cleaned up assignments for deleted permission ${permName}`), expect.any(Object));
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Admin Successfully deleted permission '${permName}' and cleaned up assignments`), expect.any(Object));
            expect(logger.error).not.toHaveBeenCalled();
        }));
        it('should throw PermissionNotFoundError if repo.delete returns false', () => __awaiter(void 0, void 0, void 0, function* () {
            permissionRepo.delete.mockResolvedValue(false);
            yield expect(service.deletePermission(adminUser_mock_1.mockAdminUser, permName))
                .rejects.toThrow(UserManagementError_1.PermissionNotFoundError);
            expect(assignmentRepo.removeAllAssignmentsForPermission).not.toHaveBeenCalled();
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Permission not found for deletion'), expect.any(Object));
        }));
        it('should throw error and log if removeAllAssignments fails', () => __awaiter(void 0, void 0, void 0, function* () {
            permissionRepo.delete.mockResolvedValue(true); // Permission deleted successfully
            const cleanupError = new Error("Cleanup failed");
            assignmentRepo.removeAllAssignmentsForPermission.mockRejectedValue(cleanupError); // Cleanup fails
            yield expect(service.deletePermission(adminUser_mock_1.mockAdminUser, permName))
                .rejects.toThrow(BaseError_1.BaseError); // Expect the wrapped error from service
            yield expect(service.deletePermission(adminUser_mock_1.mockAdminUser, permName))
                .rejects.toHaveProperty('name', 'CleanupFailedError'); // Check the specific error name
            yield expect(service.deletePermission(adminUser_mock_1.mockAdminUser, permName))
                .rejects.toThrow(/failed to remove associated assignments/); // Check message
            expect(permissionRepo.delete).toHaveBeenCalledWith(permName);
            expect(assignmentRepo.removeAllAssignmentsForPermission).toHaveBeenCalledWith(permName);
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Permission ${permName} deleted from repository`), expect.any(Object));
            // Check specific error log
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(`Failed to cleanup assignments for deleted permission ${permName}`), expect.objectContaining({ error: cleanupError }));
            // Final overall success log should NOT be called
            expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining(`Successfully deleted permission '${permName}' and cleaned up assignments`), expect.any(Object));
        }));
        it('should throw ForbiddenError if admin lacks permission', () => __awaiter(void 0, void 0, void 0, function* () {
            yield expect(service.deletePermission(adminUser_mock_1.mockNonAdminUser, permName)).rejects.toHaveProperty('statusCode', 403);
            expect(permissionRepo.delete).not.toHaveBeenCalled();
        }));
    });
    // --- listRolesForPermission ---
    describe('listRolesForPermission', () => {
        const permName = 'doc:list';
        const existingPerm = new Permission_1.Permission(permName);
        const roles = ['role-x', 'role-y'];
        it('should check permission existence and return roles from assignmentRepo', () => __awaiter(void 0, void 0, void 0, function* () {
            permissionRepo.findByName.mockResolvedValue(existingPerm);
            assignmentRepo.findRolesByPermissionName.mockResolvedValue(roles);
            const result = yield service.listRolesForPermission(adminUser_mock_1.mockAdminUser, permName);
            expect(result).toEqual(roles);
            expect(permissionRepo.findByName).toHaveBeenCalledWith(permName);
            expect(assignmentRepo.findRolesByPermissionName).toHaveBeenCalledWith(permName);
        }));
        it('should throw PermissionNotFoundError if permission does not exist', () => __awaiter(void 0, void 0, void 0, function* () {
            permissionRepo.findByName.mockResolvedValue(null);
            yield expect(service.listRolesForPermission(adminUser_mock_1.mockAdminUser, permName))
                .rejects.toThrow(UserManagementError_1.PermissionNotFoundError);
            expect(assignmentRepo.findRolesByPermissionName).not.toHaveBeenCalled();
        }));
        it('should throw ForbiddenError if admin lacks permission', () => __awaiter(void 0, void 0, void 0, function* () {
            yield expect(service.listRolesForPermission(adminUser_mock_1.mockNonAdminUser, permName)).rejects.toHaveProperty('statusCode', 403);
            expect(permissionRepo.findByName).not.toHaveBeenCalled();
            expect(assignmentRepo.findRolesByPermissionName).not.toHaveBeenCalled();
        }));
    });
});
