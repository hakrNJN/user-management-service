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
const permission_admin_service_1 = require("../../../../src/application/services/permission.admin.service"); // Assuming path
const Permission_1 = require("../../../../src/domain/entities/Permission");
const UserManagementError_1 = require("../../../../src/domain/exceptions/UserManagementError");
const adminUser_mock_1 = require("../../../mocks/adminUser.mock");
const logger_mock_1 = require("../../../mocks/logger.mock");
const repository_mock_1 = require("../../../mocks/repository.mock");
describe('PermissionAdminService', () => {
    let service;
    let permissionRepo;
    let assignmentRepo;
    // let roleRepo: jest.Mocked<IRoleRepository>; // Include if needed
    let logger;
    beforeEach(() => {
        jest.clearAllMocks();
        permissionRepo = Object.assign({}, repository_mock_1.mockPermissionRepository);
        assignmentRepo = Object.assign({}, repository_mock_1.mockAssignmentRepository);
        // roleRepo = { ...mockRoleRepository } as jest.Mocked<IRoleRepository>;
        logger = Object.assign({}, logger_mock_1.mockLogger);
        // Assuming constructor takes these
        service = new permission_admin_service_1.PermissionAdminService(permissionRepo, assignmentRepo, logger);
    });
    // --- createPermission ---
    describe('createPermission', () => {
        const permDetails = { permissionName: 'doc:create', description: 'Create documents' };
        const newPerm = new Permission_1.Permission(permDetails.permissionName, permDetails.description);
        it('should call permissionRepo.create and return Permission', () => __awaiter(void 0, void 0, void 0, function* () {
            permissionRepo.create.mockResolvedValue(undefined);
            // Assume service returns based on input if create is void
            const result = yield service.createPermission(adminUser_mock_1.mockAdminUser, permDetails);
            expect(result).toBeInstanceOf(Permission_1.Permission);
            expect(result.permissionName).toBe(permDetails.permissionName);
            expect(permissionRepo.create).toHaveBeenCalledWith(expect.objectContaining(permDetails));
        }));
        it('should throw ForbiddenError if admin lacks permission', () => __awaiter(void 0, void 0, void 0, function* () {
            yield expect(service.createPermission(adminUser_mock_1.mockNonAdminUser, permDetails))
                .rejects.toHaveProperty('statusCode', 403);
            expect(permissionRepo.create).not.toHaveBeenCalled();
        }));
        it('should re-throw PermissionExistsError from repository', () => __awaiter(void 0, void 0, void 0, function* () {
            const error = new UserManagementError_1.PermissionExistsError(permDetails.permissionName);
            permissionRepo.create.mockRejectedValue(error);
            yield expect(service.createPermission(adminUser_mock_1.mockAdminUser, permDetails))
                .rejects.toThrow(UserManagementError_1.PermissionExistsError);
        }));
        // Add generic repo error test
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
        // Add auth failure test
        // Add generic repo error test
    });
    // --- deletePermission ---
    describe('deletePermission', () => {
        const permName = 'doc:delete';
        it('should call permissionRepo.delete and assignmentRepo.removeAllAssignmentsForPermission', () => __awaiter(void 0, void 0, void 0, function* () {
            permissionRepo.delete.mockResolvedValue(true);
            assignmentRepo.removeAllAssignmentsForPermission.mockResolvedValue(undefined);
            yield service.deletePermission(adminUser_mock_1.mockAdminUser, permName);
            expect(permissionRepo.delete).toHaveBeenCalledWith(permName);
            expect(assignmentRepo.removeAllAssignmentsForPermission).toHaveBeenCalledWith(permName);
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Successfully deleted permission'), expect.any(Object));
        }));
        it('should throw PermissionNotFoundError if repo.delete returns false', () => __awaiter(void 0, void 0, void 0, function* () {
            permissionRepo.delete.mockResolvedValue(false);
            yield expect(service.deletePermission(adminUser_mock_1.mockAdminUser, permName))
                .rejects.toThrow(UserManagementError_1.PermissionNotFoundError);
            expect(assignmentRepo.removeAllAssignmentsForPermission).not.toHaveBeenCalled();
        }));
        // Add test for cleanup failure propagation (similar to Role service)
        // Add auth failure test
        // Add generic repo error test
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
        // Add auth test
        // Add assignmentRepo error test
    });
});
