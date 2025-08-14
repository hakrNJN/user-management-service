"use strict";
// tests/unit/application/services/role.admin.service.spec.ts
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
const role_admin_service_1 = require("../../../../src/application/services/role.admin.service");
const Permission_1 = require("../../../../src/domain/entities/Permission");
const Role_1 = require("../../../../src/domain/entities/Role");
const UserManagementError_1 = require("../../../../src/domain/exceptions/UserManagementError");
const BaseError_1 = require("../../../../src/shared/errors/BaseError");
const adminUser_mock_1 = require("../../../mocks/adminUser.mock");
const logger_mock_1 = require("../../../mocks/logger.mock");
const repository_mock_1 = require("../../../mocks/repository.mock");
describe('RoleAdminService', () => {
    let service;
    let roleRepo;
    let assignmentRepo;
    let permissionRepo;
    let logger;
    beforeEach(() => {
        jest.clearAllMocks();
        roleRepo = Object.assign({}, repository_mock_1.mockRoleRepository);
        assignmentRepo = Object.assign({}, repository_mock_1.mockAssignmentRepository);
        permissionRepo = Object.assign({}, repository_mock_1.mockPermissionRepository);
        logger = Object.assign({}, logger_mock_1.mockLogger);
        service = new role_admin_service_1.RoleAdminService(roleRepo, assignmentRepo, permissionRepo, logger);
    });
    // --- createRole ---
    describe('createRole', () => {
        const roleDetails = { roleName: 'new-role', description: 'A new role' };
        const newRole = new Role_1.Role(roleDetails.roleName, roleDetails.description);
        it('should call roleRepo.create and return Role on success', () => __awaiter(void 0, void 0, void 0, function* () {
            roleRepo.create.mockResolvedValue(undefined);
            const result = yield service.createRole(adminUser_mock_1.mockAdminUser, roleDetails);
            expect(result).toBeInstanceOf(Role_1.Role);
            expect(result.roleName).toBe(roleDetails.roleName);
            expect(roleRepo.create).toHaveBeenCalledWith(expect.objectContaining(roleDetails));
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('successfully created role'), expect.any(Object));
        }));
        it('should throw ForbiddenError if admin lacks permission', () => __awaiter(void 0, void 0, void 0, function* () {
            yield expect(service.createRole(adminUser_mock_1.mockNonAdminUser, roleDetails))
                .rejects.toHaveProperty('statusCode', 403);
            expect(roleRepo.create).not.toHaveBeenCalled();
        }));
        it('should re-throw RoleExistsError from repository', () => __awaiter(void 0, void 0, void 0, function* () {
            const error = new UserManagementError_1.RoleExistsError(roleDetails.roleName);
            roleRepo.create.mockRejectedValue(error);
            yield expect(service.createRole(adminUser_mock_1.mockAdminUser, roleDetails))
                .rejects.toThrow(UserManagementError_1.RoleExistsError);
        }));
    });
    // --- getRole ---
    describe('getRole', () => {
        const roleName = 'editor';
        const existingRole = new Role_1.Role(roleName, 'Editor Role');
        it('should call roleRepo.findByName and return Role if found', () => __awaiter(void 0, void 0, void 0, function* () {
            roleRepo.findByName.mockResolvedValue(existingRole);
            const result = yield service.getRole(adminUser_mock_1.mockAdminUser, roleName);
            expect(result).toEqual(existingRole);
            expect(roleRepo.findByName).toHaveBeenCalledWith(roleName);
        }));
        it('should return null if role not found', () => __awaiter(void 0, void 0, void 0, function* () {
            roleRepo.findByName.mockResolvedValue(null);
            const result = yield service.getRole(adminUser_mock_1.mockAdminUser, roleName);
            expect(result).toBeNull();
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Role not found'), expect.any(Object));
        }));
        it('should throw ForbiddenError if admin lacks permission', () => __awaiter(void 0, void 0, void 0, function* () {
            yield expect(service.getRole(adminUser_mock_1.mockNonAdminUser, roleName)).rejects.toHaveProperty('statusCode', 403);
        }));
    });
    // --- listRoles ---
    describe('listRoles', () => {
        const mockRoles = [new Role_1.Role('r1'), new Role_1.Role('r2')];
        const mockResult = { items: mockRoles, lastEvaluatedKey: { pk: 'a', sk: 'b' } };
        it('should call roleRepo.list and return result', () => __awaiter(void 0, void 0, void 0, function* () {
            roleRepo.list.mockResolvedValue(mockResult);
            const options = { limit: 10 };
            const result = yield service.listRoles(adminUser_mock_1.mockAdminUser, options);
            expect(result).toEqual(mockResult);
            expect(roleRepo.list).toHaveBeenCalledWith(options);
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('successfully listed 2 roles'), expect.any(Object));
        }));
        it('should throw ForbiddenError if admin lacks permission', () => __awaiter(void 0, void 0, void 0, function* () {
            yield expect(service.listRoles(adminUser_mock_1.mockNonAdminUser)).rejects.toHaveProperty('statusCode', 403);
        }));
    });
    // --- updateRole ---
    describe('updateRole', () => {
        const roleName = 'updater';
        const updates = { description: 'New Description' };
        const updatedRole = new Role_1.Role(roleName, updates.description);
        it('should call roleRepo.update and return updated Role', () => __awaiter(void 0, void 0, void 0, function* () {
            roleRepo.update.mockResolvedValue(updatedRole);
            const result = yield service.updateRole(adminUser_mock_1.mockAdminUser, roleName, updates);
            expect(result).toEqual(updatedRole);
            expect(roleRepo.update).toHaveBeenCalledWith(roleName, updates);
        }));
        it('should return null if role not found for update', () => __awaiter(void 0, void 0, void 0, function* () {
            roleRepo.update.mockResolvedValue(null);
            const result = yield service.updateRole(adminUser_mock_1.mockAdminUser, roleName, updates);
            expect(result).toBeNull();
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Role not found for update'), expect.any(Object));
        }));
        it('should throw ForbiddenError if admin lacks permission', () => __awaiter(void 0, void 0, void 0, function* () {
            yield expect(service.updateRole(adminUser_mock_1.mockNonAdminUser, roleName, updates)).rejects.toHaveProperty('statusCode', 403);
        }));
    });
    // --- deleteRole ---
    describe('deleteRole', () => {
        const roleName = 'deleter';
        it('should call roleRepo.delete and assignmentRepo.removeAllAssignmentsForRole on success', () => __awaiter(void 0, void 0, void 0, function* () {
            roleRepo.delete.mockResolvedValue(true); // Role found and deleted
            assignmentRepo.removeAllAssignmentsForRole.mockResolvedValue(undefined); // Cleanup success
            yield service.deleteRole(adminUser_mock_1.mockAdminUser, roleName);
            expect(roleRepo.delete).toHaveBeenCalledWith(roleName);
            expect(assignmentRepo.removeAllAssignmentsForRole).toHaveBeenCalledWith(roleName); // Verify cleanup called
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Successfully cleaned up assignments for deleted role ${roleName}`), expect.any(Object));
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Admin successfully deleted role '${roleName}' and cleaned up assignments`), expect.any(Object));
            expect(logger.error).not.toHaveBeenCalled();
        }));
        it('should throw RoleNotFoundError if roleRepo.delete returns false', () => __awaiter(void 0, void 0, void 0, function* () {
            roleRepo.delete.mockResolvedValue(false);
            yield expect(service.deleteRole(adminUser_mock_1.mockAdminUser, roleName))
                .rejects.toThrow(UserManagementError_1.RoleNotFoundError);
            expect(assignmentRepo.removeAllAssignmentsForRole).not.toHaveBeenCalled();
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Role not found for deletion'), expect.any(Object));
        }));
        it('should throw error and log if removeAllAssignments fails', () => __awaiter(void 0, void 0, void 0, function* () {
            roleRepo.delete.mockResolvedValue(true); // Role deleted successfully
            const cleanupError = new Error("Cleanup failed");
            assignmentRepo.removeAllAssignmentsForRole.mockRejectedValue(cleanupError); // Cleanup fails
            yield expect(service.deleteRole(adminUser_mock_1.mockAdminUser, roleName))
                .rejects.toThrow(BaseError_1.BaseError); // Expect wrapped error
            yield expect(service.deleteRole(adminUser_mock_1.mockAdminUser, roleName))
                .rejects.toHaveProperty('name', 'CleanupFailedError'); // Check specific error name
            yield expect(service.deleteRole(adminUser_mock_1.mockAdminUser, roleName))
                .rejects.toThrow(/failed to remove associated assignments/); // Check message
            expect(roleRepo.delete).toHaveBeenCalledWith(roleName);
            expect(assignmentRepo.removeAllAssignmentsForRole).toHaveBeenCalledWith(roleName);
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Role ${roleName} deleted from repository`), expect.any(Object));
            // Check specific error log
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(`Failed to cleanup assignments for deleted role ${roleName}`), expect.objectContaining({ error: cleanupError }));
            // Final overall success log should NOT be called
            expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining(`successfully deleted role '${roleName}' and cleaned up assignments`), expect.any(Object));
        }));
        it('should throw ForbiddenError if admin lacks permission', () => __awaiter(void 0, void 0, void 0, function* () {
            yield expect(service.deleteRole(adminUser_mock_1.mockNonAdminUser, roleName)).rejects.toHaveProperty('statusCode', 403);
            expect(roleRepo.delete).not.toHaveBeenCalled();
        }));
    });
    // --- assignPermissionToRole ---
    describe('assignPermissionToRole', () => {
        const roleName = 'assigner-role';
        const permName = 'assigner-perm';
        const existingRole = new Role_1.Role(roleName);
        const existingPerm = new Permission_1.Permission(permName);
        it('should check role/permission existence and call assignmentRepo.assignPermissionToRole', () => __awaiter(void 0, void 0, void 0, function* () {
            roleRepo.findByName.mockResolvedValue(existingRole);
            permissionRepo.findByName.mockResolvedValue(existingPerm);
            assignmentRepo.assignPermissionToRole.mockResolvedValue(undefined);
            yield service.assignPermissionToRole(adminUser_mock_1.mockAdminUser, roleName, permName);
            expect(roleRepo.findByName).toHaveBeenCalledWith(roleName);
            expect(permissionRepo.findByName).toHaveBeenCalledWith(permName);
            expect(assignmentRepo.assignPermissionToRole).toHaveBeenCalledWith(roleName, permName);
            // FIX: Check for the specific success log
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Admin successfully assigned permission '${permName}' to role '${roleName}'`), expect.objectContaining({ adminUserId: adminUser_mock_1.mockAdminUser.id }));
        }));
        it('should throw RoleNotFoundError if role does not exist', () => __awaiter(void 0, void 0, void 0, function* () {
            roleRepo.findByName.mockResolvedValue(null);
            permissionRepo.findByName.mockResolvedValue(existingPerm);
            yield expect(service.assignPermissionToRole(adminUser_mock_1.mockAdminUser, roleName, permName))
                .rejects.toThrow(UserManagementError_1.RoleNotFoundError);
            expect(assignmentRepo.assignPermissionToRole).not.toHaveBeenCalled();
        }));
        it('should throw PermissionNotFoundError if permission does not exist', () => __awaiter(void 0, void 0, void 0, function* () {
            roleRepo.findByName.mockResolvedValue(existingRole);
            permissionRepo.findByName.mockResolvedValue(null);
            yield expect(service.assignPermissionToRole(adminUser_mock_1.mockAdminUser, roleName, permName))
                .rejects.toThrow(UserManagementError_1.PermissionNotFoundError);
            expect(assignmentRepo.assignPermissionToRole).not.toHaveBeenCalled();
        }));
        it('should throw ForbiddenError if admin lacks permission', () => __awaiter(void 0, void 0, void 0, function* () {
            yield expect(service.assignPermissionToRole(adminUser_mock_1.mockNonAdminUser, roleName, permName)).rejects.toHaveProperty('statusCode', 403);
            expect(assignmentRepo.assignPermissionToRole).not.toHaveBeenCalled();
        }));
        it('should throw AssignmentError if assignmentRepo fails', () => __awaiter(void 0, void 0, void 0, function* () {
            roleRepo.findByName.mockResolvedValue(existingRole);
            permissionRepo.findByName.mockResolvedValue(existingPerm);
            const assignError = new Error("DB assign failed");
            assignmentRepo.assignPermissionToRole.mockRejectedValue(assignError);
            yield expect(service.assignPermissionToRole(adminUser_mock_1.mockAdminUser, roleName, permName))
                .rejects.toThrow(UserManagementError_1.AssignmentError);
            yield expect(service.assignPermissionToRole(adminUser_mock_1.mockAdminUser, roleName, permName))
                .rejects.toThrow(/Failed to assign permission/);
        }));
    });
    // --- removePermissionFromRole ---
    describe('removePermissionFromRole', () => {
        const roleName = 'remover-role';
        const permName = 'remover-perm';
        it('should call assignmentRepo.removePermissionFromRole', () => __awaiter(void 0, void 0, void 0, function* () {
            assignmentRepo.removePermissionFromRole.mockResolvedValue(undefined);
            yield service.removePermissionFromRole(adminUser_mock_1.mockAdminUser, roleName, permName);
            expect(assignmentRepo.removePermissionFromRole).toHaveBeenCalledWith(roleName, permName);
            // FIX: Check for the specific success log
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Admin successfully removed permission '${permName}' from role '${roleName}'`), expect.objectContaining({ adminUserId: adminUser_mock_1.mockAdminUser.id }));
        }));
        it('should throw ForbiddenError if admin lacks permission', () => __awaiter(void 0, void 0, void 0, function* () {
            yield expect(service.removePermissionFromRole(adminUser_mock_1.mockNonAdminUser, roleName, permName)).rejects.toHaveProperty('statusCode', 403);
            expect(assignmentRepo.removePermissionFromRole).not.toHaveBeenCalled();
        }));
        it('should throw AssignmentError if assignmentRepo fails', () => __awaiter(void 0, void 0, void 0, function* () {
            const removeError = new Error("DB remove failed");
            assignmentRepo.removePermissionFromRole.mockRejectedValue(removeError);
            yield expect(service.removePermissionFromRole(adminUser_mock_1.mockAdminUser, roleName, permName))
                .rejects.toThrow(UserManagementError_1.AssignmentError);
            yield expect(service.removePermissionFromRole(adminUser_mock_1.mockAdminUser, roleName, permName))
                .rejects.toThrow(/Failed to remove permission/);
        }));
    });
    // --- listPermissionsForRole ---
    describe('listPermissionsForRole', () => {
        const roleName = 'lister-role';
        const existingRole = new Role_1.Role(roleName);
        const perms = ['perm1', 'perm2'];
        it('should check role existence and return permissions from assignmentRepo', () => __awaiter(void 0, void 0, void 0, function* () {
            roleRepo.findByName.mockResolvedValue(existingRole);
            assignmentRepo.findPermissionsByRoleName.mockResolvedValue(perms);
            const result = yield service.listPermissionsForRole(adminUser_mock_1.mockAdminUser, roleName);
            expect(result).toEqual(perms);
            expect(roleRepo.findByName).toHaveBeenCalledWith(roleName);
            expect(assignmentRepo.findPermissionsByRoleName).toHaveBeenCalledWith(roleName);
        }));
        it('should throw RoleNotFoundError if role does not exist', () => __awaiter(void 0, void 0, void 0, function* () {
            roleRepo.findByName.mockResolvedValue(null);
            yield expect(service.listPermissionsForRole(adminUser_mock_1.mockAdminUser, roleName))
                .rejects.toThrow(UserManagementError_1.RoleNotFoundError);
            expect(assignmentRepo.findPermissionsByRoleName).not.toHaveBeenCalled();
        }));
        it('should throw ForbiddenError if admin lacks permission', () => __awaiter(void 0, void 0, void 0, function* () {
            yield expect(service.listPermissionsForRole(adminUser_mock_1.mockNonAdminUser, roleName)).rejects.toHaveProperty('statusCode', 403);
            expect(roleRepo.findByName).not.toHaveBeenCalled(); // Check doesn't even happen
            expect(assignmentRepo.findPermissionsByRoleName).not.toHaveBeenCalled();
        }));
    });
});
