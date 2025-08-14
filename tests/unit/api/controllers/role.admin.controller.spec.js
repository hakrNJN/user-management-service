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
const role_admin_service_1 = require("../../../../src/application/services/role.admin.service"); // Assuming path
const Permission_1 = require("../../../../src/domain/entities/Permission");
const Role_1 = require("../../../../src/domain/entities/Role");
const UserManagementError_1 = require("../../../../src/domain/exceptions/UserManagementError"); // Assuming these exist
const adminUser_mock_1 = require("../../../mocks/adminUser.mock");
const logger_mock_1 = require("../../../mocks/logger.mock");
const repository_mock_1 = require("../../../mocks/repository.mock");
describe('RoleAdminService', () => {
    let service;
    let roleRepo;
    let assignmentRepo;
    let permissionRepo; // Added mock
    let logger;
    beforeEach(() => {
        jest.clearAllMocks();
        roleRepo = Object.assign({}, repository_mock_1.mockRoleRepository);
        assignmentRepo = Object.assign({}, repository_mock_1.mockAssignmentRepository);
        permissionRepo = Object.assign({}, repository_mock_1.mockPermissionRepository); // Initialize mock
        logger = Object.assign({}, logger_mock_1.mockLogger);
        // Assuming RoleAdminService constructor takes these dependencies
        service = new role_admin_service_1.RoleAdminService(roleRepo, assignmentRepo, permissionRepo, logger);
    });
    // --- createRole ---
    describe('createRole', () => {
        const roleDetails = { roleName: 'new-role', description: 'A new role' };
        const newRole = new Role_1.Role(roleDetails.roleName, roleDetails.description);
        it('should call roleRepo.create and return Role on success', () => __awaiter(void 0, void 0, void 0, function* () {
            roleRepo.create.mockResolvedValue(undefined); // Create returns void
            // Mock findByName to simulate it doesn't exist yet (optional but good practice for some impl)
            roleRepo.findByName.mockResolvedValue(null);
            const result = yield service.createRole(adminUser_mock_1.mockAdminUser, roleDetails);
            // Service might fetch after create or trust the input, test based on impl
            // For now, assume it returns based on input if create is void
            expect(result).toBeInstanceOf(Role_1.Role);
            expect(result.roleName).toBe(roleDetails.roleName);
            expect(roleRepo.create).toHaveBeenCalledWith(expect.objectContaining(roleDetails));
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('attempting to create role'), expect.any(Object));
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
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('failed to create role'), expect.objectContaining({ error }));
        }));
        // Add test for generic DatabaseError from repo
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
        const updatedRole = new Role_1.Role(roleName, updates.description);
        it('should call roleRepo.update and return updated Role', () => __awaiter(void 0, void 0, void 0, function* () {
            roleRepo.update.mockResolvedValue(updatedRole);
            const result = yield service.updateRole(adminUser_mock_1.mockAdminUser, roleName, updates);
            expect(result).toEqual(updatedRole);
            expect(roleRepo.update).toHaveBeenCalledWith(roleName, updates);
        }));
        it('should return null if role not found for update', () => __awaiter(void 0, void 0, void 0, function* () {
            roleRepo.update.mockResolvedValue(null); // Repo signals not found
            const result = yield service.updateRole(adminUser_mock_1.mockAdminUser, roleName, updates);
            expect(result).toBeNull();
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Role not found for update'), expect.any(Object));
        }));
        // Add auth failure test
        // Add generic repo error test
    });
    // --- deleteRole ---
    describe('deleteRole', () => {
        const roleName = 'deleter';
        it('should call roleRepo.delete and assignmentRepo.removeAllAssignmentsForRole', () => __awaiter(void 0, void 0, void 0, function* () {
            roleRepo.delete.mockResolvedValue(true); // Role was found and deleted
            assignmentRepo.removeAllAssignmentsForRole.mockResolvedValue(undefined);
            yield service.deleteRole(adminUser_mock_1.mockAdminUser, roleName);
            expect(roleRepo.delete).toHaveBeenCalledWith(roleName);
            expect(assignmentRepo.removeAllAssignmentsForRole).toHaveBeenCalledWith(roleName);
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('successfully deleted role'), expect.any(Object));
        }));
        it('should throw RoleNotFoundError if roleRepo.delete returns false', () => __awaiter(void 0, void 0, void 0, function* () {
            roleRepo.delete.mockResolvedValue(false); // Role not found
            yield expect(service.deleteRole(adminUser_mock_1.mockAdminUser, roleName))
                .rejects.toThrow(UserManagementError_1.RoleNotFoundError);
            expect(assignmentRepo.removeAllAssignmentsForRole).not.toHaveBeenCalled();
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Role not found for deletion'), expect.any(Object));
        }));
        it('should log error but potentially continue if removeAllAssignments fails', () => __awaiter(void 0, void 0, void 0, function* () {
            // Decide on desired behavior: should deletion fail if cleanup fails? Often, yes.
            roleRepo.delete.mockResolvedValue(true);
            const cleanupError = new Error("Cleanup failed");
            assignmentRepo.removeAllAssignmentsForRole.mockRejectedValue(cleanupError);
            // Update expectation to match the actual thrown error message
            yield expect(service.deleteRole(adminUser_mock_1.mockAdminUser, roleName))
                .rejects.toThrow("Role deleter was deleted, but failed to remove associated assignments: Cleanup failed");
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to cleanup assignments'), expect.objectContaining({ error: cleanupError }));
        }));
        it('should log error but potentially continue if removeAllAssignments fails', () => __awaiter(void 0, void 0, void 0, function* () {
            // Decide on desired behavior: should deletion fail if cleanup fails? Often, yes.
            roleRepo.delete.mockResolvedValue(true);
            const cleanupError = new Error("Cleanup failed");
            assignmentRepo.removeAllAssignmentsForRole.mockRejectedValue(cleanupError);
            // Update expectation to match the actual thrown error message
            yield expect(service.deleteRole(adminUser_mock_1.mockAdminUser, roleName))
                .rejects.toThrow(`Role ${roleName} was deleted, but failed to remove associated assignments: Cleanup failed`);
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to cleanup assignments'), expect.objectContaining({ error: cleanupError }));
        }));
        // Add auth failure test
        // Add generic repo error test
    });
    // --- assignPermissionToRole ---
    describe('assignPermissionToRole', () => {
        const roleName = 'assigner-role';
        const permName = 'assigner-perm';
        const existingRole = new Role_1.Role(roleName);
        const existingPerm = new Permission_1.Permission(permName);
        it('should check role/permission existence and call assignmentRepo.assignPermissionToRole', () => __awaiter(void 0, void 0, void 0, function* () {
            roleRepo.findByName.mockResolvedValue(existingRole);
            permissionRepo.findByName.mockResolvedValue(existingPerm); // Mock permission check
            assignmentRepo.assignPermissionToRole.mockResolvedValue(undefined);
            yield service.assignPermissionToRole(adminUser_mock_1.mockAdminUser, roleName, permName);
            expect(roleRepo.findByName).toHaveBeenCalledWith(roleName);
            expect(permissionRepo.findByName).toHaveBeenCalledWith(permName);
            expect(assignmentRepo.assignPermissionToRole).toHaveBeenCalledWith(roleName, permName);
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`successfully assigned permission '${permName}' to role '${roleName}'`), expect.any(Object));
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
        // Add auth test
        // Add assignmentRepo error test
    });
    // --- removePermissionFromRole ---
    describe('removePermissionFromRole', () => {
        const roleName = 'remover-role';
        const permName = 'remover-perm';
        it('should call assignmentRepo.removePermissionFromRole', () => __awaiter(void 0, void 0, void 0, function* () {
            // Optional: could check role/perm existence first, but often deletion is okay if they don't exist
            assignmentRepo.removePermissionFromRole.mockResolvedValue(undefined);
            yield service.removePermissionFromRole(adminUser_mock_1.mockAdminUser, roleName, permName);
            expect(assignmentRepo.removePermissionFromRole).toHaveBeenCalledWith(roleName, permName);
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`successfully removed permission '${permName}' from role '${roleName}'`), expect.any(Object));
        }));
        // Add auth test
        // Add assignmentRepo error test
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
        // Add auth test
        // Add assignmentRepo error test
    });
});
