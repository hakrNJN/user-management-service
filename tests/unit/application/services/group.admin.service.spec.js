"use strict";
// tests/unit/application/services/group.admin.service.spec.ts
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
const group_admin_service_1 = require("../../../../src/application/services/group.admin.service");
const Group_1 = require("../../../../src/domain/entities/Group");
const Role_1 = require("../../../../src/domain/entities/Role"); // Added
const UserManagementError_1 = require("../../../../src/domain/exceptions/UserManagementError"); // Added
const BaseError_1 = require("../../../../src/shared/errors/BaseError");
const adapter_mock_1 = require("../../../mocks/adapter.mock");
const adminUser_mock_1 = require("../../../mocks/adminUser.mock");
const logger_mock_1 = require("../../../mocks/logger.mock");
const repository_mock_1 = require("../../../mocks/repository.mock"); // Added
describe('GroupAdminService', () => {
    let service;
    let adapter;
    let assignmentRepository; // Added
    let roleRepository; // Added
    let logger;
    beforeEach(() => {
        jest.clearAllMocks();
        adapter = Object.assign({}, adapter_mock_1.mockUserMgmtAdapter);
        assignmentRepository = Object.assign({}, repository_mock_1.mockAssignmentRepository); // Initialize
        roleRepository = Object.assign({}, repository_mock_1.mockRoleRepository); // Initialize
        logger = Object.assign({}, logger_mock_1.mockLogger);
        // Update constructor call with new dependencies
        service = new group_admin_service_1.GroupAdminService(adapter, assignmentRepository, roleRepository, logger);
    });
    // --- createGroup (No changes needed if create doesn't involve assignments) ---
    describe('createGroup', () => {
        const groupDetails = { groupName: 'new-group', description: 'A new group' };
        const mockCognitoGroup = {
            GroupName: groupDetails.groupName, Description: groupDetails.description,
            UserPoolId: 'pool-id', CreationDate: new Date(), LastModifiedDate: new Date(),
        };
        it('should call adapter.adminCreateGroup and return mapped Group on success', () => __awaiter(void 0, void 0, void 0, function* () {
            adapter.adminCreateGroup.mockResolvedValue(mockCognitoGroup);
            const result = yield service.createGroup(adminUser_mock_1.mockAdminUser, groupDetails);
            expect(result).toBeInstanceOf(Group_1.Group);
            expect(result.groupName).toBe(groupDetails.groupName);
            expect(adapter.adminCreateGroup).toHaveBeenCalledWith(groupDetails);
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('successfully created group'), expect.any(Object));
        }));
        it('should throw ForbiddenError if admin lacks permission', () => __awaiter(void 0, void 0, void 0, function* () {
            yield expect(service.createGroup(adminUser_mock_1.mockNonAdminUser, groupDetails))
                .rejects.toHaveProperty('statusCode', 403);
            expect(adapter.adminCreateGroup).not.toHaveBeenCalled();
        }));
        it('should re-throw GroupExistsError from adapter', () => __awaiter(void 0, void 0, void 0, function* () {
            // Assume adapter maps Cognito's GroupExistsException to domain's GroupExistsError
            const error = new UserManagementError_1.GroupExistsError(groupDetails.groupName);
            adapter.adminCreateGroup.mockRejectedValue(error);
            yield expect(service.createGroup(adminUser_mock_1.mockAdminUser, groupDetails))
                .rejects.toThrow(UserManagementError_1.GroupExistsError);
            expect(logger.error).toHaveBeenCalled();
        }));
    });
    // --- getGroup (No changes needed) ---
    describe('getGroup', () => {
        const groupName = 'existing-group';
        const mockCognitoGroup = { GroupName: groupName, UserPoolId: 'pool-id', Description: 'Test' };
        it('should call adapter.adminGetGroup and return mapped Group if found', () => __awaiter(void 0, void 0, void 0, function* () {
            adapter.adminGetGroup.mockResolvedValue(mockCognitoGroup);
            const result = yield service.getGroup(adminUser_mock_1.mockAdminUser, groupName);
            expect(result).toBeInstanceOf(Group_1.Group);
            expect(result === null || result === void 0 ? void 0 : result.groupName).toBe(groupName);
            expect(adapter.adminGetGroup).toHaveBeenCalledWith(groupName);
        }));
        it('should return null if adapter returns null', () => __awaiter(void 0, void 0, void 0, function* () {
            adapter.adminGetGroup.mockResolvedValue(null);
            const result = yield service.getGroup(adminUser_mock_1.mockAdminUser, groupName);
            expect(result).toBeNull();
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Group not found'), expect.any(Object));
        }));
        it('should throw ForbiddenError if admin lacks permission', () => __awaiter(void 0, void 0, void 0, function* () {
            yield expect(service.getGroup(adminUser_mock_1.mockNonAdminUser, groupName))
                .rejects.toHaveProperty('statusCode', 403);
        }));
    });
    // --- listGroups (No changes needed) ---
    describe('listGroups', () => {
        const mockCognitoGroup1 = {
            GroupName: 'group1',
            UserPoolId: 'pool-id',
            Description: 'Group One',
            CreationDate: new Date(),
            LastModifiedDate: new Date(),
            Precedence: 10
        };
        // ... tests remain the same ...
        const mockCognitoGroups = [mockCognitoGroup1];
        it('should call adapter.adminListGroups and return mapped Groups and token', () => __awaiter(void 0, void 0, void 0, function* () {
            // FIX: Use the defined mock data in the resolved value
            adapter.adminListGroups.mockResolvedValue({ groups: mockCognitoGroups, nextToken: 'token123' });
            // Call the service
            const result = yield service.listGroups(adminUser_mock_1.mockAdminUser, 10, 'startToken');
            // Assertions based on the mock data provided
            expect(result.groups).toHaveLength(1); // Now expects length 1
            expect(result.groups[0]).toBeInstanceOf(Group_1.Group);
            expect(result.groups[0].groupName).toBe('group1');
            expect(result.groups[0].description).toBe('Group One'); // Check mapped fields
            expect(result.nextToken).toBe('token123');
            expect(adapter.adminListGroups).toHaveBeenCalledWith(10, 'startToken');
            // Log message should reflect the actual number of groups mapped
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('successfully listed 1 groups'), expect.any(Object));
        }));
        it('should handle empty list from adapter', () => __awaiter(void 0, void 0, void 0, function* () {
            // This test remains correct
            adapter.adminListGroups.mockResolvedValue({ groups: [], nextToken: undefined });
            const result = yield service.listGroups(adminUser_mock_1.mockAdminUser);
            expect(result.groups).toHaveLength(0);
            expect(result.nextToken).toBeUndefined();
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('successfully listed 0 groups'), expect.any(Object));
        }));
        // ... other listGroups tests ...
    });
    // --- deleteGroup (UPDATED TESTS) ---
    describe('deleteGroup', () => {
        const groupName = 'group-to-delete';
        it('should delete cognito group and cleanup assignments successfully', () => __awaiter(void 0, void 0, void 0, function* () {
            adapter.adminDeleteGroup.mockResolvedValue(undefined); // Cognito delete success
            assignmentRepository.removeAllAssignmentsForGroup.mockResolvedValue(undefined); // Cleanup success
            yield service.deleteGroup(adminUser_mock_1.mockAdminUser, groupName);
            expect(adapter.adminDeleteGroup).toHaveBeenCalledWith(groupName);
            expect(assignmentRepository.removeAllAssignmentsForGroup).toHaveBeenCalledWith(groupName); // Verify cleanup called
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`successfully deleted Cognito group ${groupName}`), expect.any(Object));
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Successfully cleaned up assignments for deleted group ${groupName}`), expect.any(Object));
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`successfully deleted group '${groupName}' and cleaned up assignments`), expect.any(Object));
            expect(logger.error).not.toHaveBeenCalled(); // No errors logged
        }));
        it('should throw ForbiddenError if admin user lacks permission', () => __awaiter(void 0, void 0, void 0, function* () {
            yield expect(service.deleteGroup(adminUser_mock_1.mockNonAdminUser, groupName))
                .rejects.toHaveProperty('statusCode', 403);
            expect(adapter.adminDeleteGroup).not.toHaveBeenCalled();
            expect(assignmentRepository.removeAllAssignmentsForGroup).not.toHaveBeenCalled();
        }));
        it('should throw GroupNotFoundError if cognito group deletion fails with NotFound', () => __awaiter(void 0, void 0, void 0, function* () {
            // Simulate adapter throwing mapped NotFoundError
            const error = new BaseError_1.NotFoundError('Group'); // Or specific GroupNotFoundError if mapped
            adapter.adminDeleteGroup.mockRejectedValue(error);
            yield expect(service.deleteGroup(adminUser_mock_1.mockAdminUser, groupName))
                .rejects.toThrow(UserManagementError_1.GroupNotFoundError); // Expect service to throw specific error
            expect(adapter.adminDeleteGroup).toHaveBeenCalledWith(groupName);
            expect(assignmentRepository.removeAllAssignmentsForGroup).not.toHaveBeenCalled(); // Cleanup not called
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('failed to delete Cognito group'), expect.any(Object));
        }));
        it('should re-throw other errors from cognito group deletion', () => __awaiter(void 0, void 0, void 0, function* () {
            const error = new Error("Cognito internal delete error");
            adapter.adminDeleteGroup.mockRejectedValue(error);
            yield expect(service.deleteGroup(adminUser_mock_1.mockAdminUser, groupName)).rejects.toThrow(error);
            expect(assignmentRepository.removeAllAssignmentsForGroup).not.toHaveBeenCalled();
        }));
        it('should delete cognito group but throw CleanupFailedError if assignment cleanup fails', () => __awaiter(void 0, void 0, void 0, function* () {
            adapter.adminDeleteGroup.mockResolvedValue(undefined); // Cognito delete success
            const cleanupError = new Error("DynamoDB cleanup failed");
            assignmentRepository.removeAllAssignmentsForGroup.mockRejectedValue(cleanupError); // Cleanup fails
            yield expect(service.deleteGroup(adminUser_mock_1.mockAdminUser, groupName))
                .rejects.toThrow(BaseError_1.BaseError); // Expect the wrapped BaseError from service
            yield expect(service.deleteGroup(adminUser_mock_1.mockAdminUser, groupName))
                .rejects.toHaveProperty('name', 'CleanupFailedError'); // Check the specific name set by the service
            yield expect(service.deleteGroup(adminUser_mock_1.mockAdminUser, groupName))
                .rejects.toThrow(/failed to remove associated role assignments/); // Check message
            expect(adapter.adminDeleteGroup).toHaveBeenCalledWith(groupName);
            expect(assignmentRepository.removeAllAssignmentsForGroup).toHaveBeenCalledWith(groupName);
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`successfully deleted Cognito group ${groupName}`), expect.any(Object));
            // Check that the specific cleanup error log message was called
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(`Failed to cleanup assignments for deleted group ${groupName}`), expect.objectContaining({ error: cleanupError }));
            // Final overall success log should NOT be called
            expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining(`successfully deleted group '${groupName}' and cleaned up assignments`), expect.any(Object));
        }));
    });
    // --- NEW: assignRoleToGroup ---
    describe('assignRoleToGroup', () => {
        const groupName = 'assign-test-group';
        const roleName = 'assign-test-role';
        const mockCognitoGroup = { GroupName: groupName, UserPoolId: 'pool-id' };
        const mockRole = new Role_1.Role(roleName);
        it('should validate existence and call assignment repo on success', () => __awaiter(void 0, void 0, void 0, function* () {
            adapter.adminGetGroup.mockResolvedValue(mockCognitoGroup); // Group exists
            roleRepository.findByName.mockResolvedValue(mockRole); // Role exists
            assignmentRepository.assignRoleToGroup.mockResolvedValue(undefined); // Assign succeeds
            yield service.assignRoleToGroup(adminUser_mock_1.mockAdminUser, groupName, roleName);
            expect(adapter.adminGetGroup).toHaveBeenCalledWith(groupName);
            expect(roleRepository.findByName).toHaveBeenCalledWith(roleName);
            expect(assignmentRepository.assignRoleToGroup).toHaveBeenCalledWith(groupName, roleName);
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('successfully assigned role'), expect.any(Object));
        }));
        it('should throw GroupNotFoundError if cognito group does not exist', () => __awaiter(void 0, void 0, void 0, function* () {
            adapter.adminGetGroup.mockResolvedValue(null); // Group NOT found
            roleRepository.findByName.mockResolvedValue(mockRole); // Role exists
            yield expect(service.assignRoleToGroup(adminUser_mock_1.mockAdminUser, groupName, roleName))
                .rejects.toThrow(UserManagementError_1.GroupNotFoundError);
            expect(roleRepository.findByName).not.toHaveBeenCalled(); // Role check skipped
            expect(assignmentRepository.assignRoleToGroup).not.toHaveBeenCalled();
        }));
        it('should throw RoleNotFoundError if custom role does not exist', () => __awaiter(void 0, void 0, void 0, function* () {
            adapter.adminGetGroup.mockResolvedValue(mockCognitoGroup); // Group exists
            roleRepository.findByName.mockResolvedValue(null); // Role NOT found
            yield expect(service.assignRoleToGroup(adminUser_mock_1.mockAdminUser, groupName, roleName))
                .rejects.toThrow(UserManagementError_1.RoleNotFoundError);
            expect(assignmentRepository.assignRoleToGroup).not.toHaveBeenCalled();
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(`Role '${roleName}' not found`), expect.any(Object));
        }));
        it('should throw AssignmentError if assignment repo fails', () => __awaiter(void 0, void 0, void 0, function* () {
            adapter.adminGetGroup.mockResolvedValue(mockCognitoGroup);
            roleRepository.findByName.mockResolvedValue(mockRole);
            const assignError = new Error("DB assign failed");
            assignmentRepository.assignRoleToGroup.mockRejectedValue(assignError);
            yield expect(service.assignRoleToGroup(adminUser_mock_1.mockAdminUser, groupName, roleName))
                .rejects.toThrow(UserManagementError_1.AssignmentError);
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('failed to assign role'), expect.objectContaining({ error: assignError }));
        }));
        it('should throw ForbiddenError if admin lacks permission', () => __awaiter(void 0, void 0, void 0, function* () {
            yield expect(service.assignRoleToGroup(adminUser_mock_1.mockNonAdminUser, groupName, roleName)).rejects.toHaveProperty('statusCode', 403);
            expect(adapter.adminGetGroup).not.toHaveBeenCalled();
            expect(roleRepository.findByName).not.toHaveBeenCalled();
            expect(assignmentRepository.assignRoleToGroup).not.toHaveBeenCalled();
        }));
    });
    // --- NEW: removeRoleFromGroup ---
    describe('removeRoleFromGroup', () => {
        const groupName = 'remove-test-group';
        const roleName = 'remove-test-role';
        it('should call assignment repo remove successfully', () => __awaiter(void 0, void 0, void 0, function* () {
            assignmentRepository.removeRoleFromGroup.mockResolvedValue(undefined);
            yield service.removeRoleFromGroup(adminUser_mock_1.mockAdminUser, groupName, roleName);
            expect(assignmentRepository.removeRoleFromGroup).toHaveBeenCalledWith(groupName, roleName);
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('successfully removed role'), expect.any(Object));
        }));
        it('should throw AssignmentError if assignment repo fails', () => __awaiter(void 0, void 0, void 0, function* () {
            const removeError = new Error("DB remove failed");
            assignmentRepository.removeRoleFromGroup.mockRejectedValue(removeError);
            yield expect(service.removeRoleFromGroup(adminUser_mock_1.mockAdminUser, groupName, roleName))
                .rejects.toThrow(UserManagementError_1.AssignmentError);
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('failed to remove role'), expect.objectContaining({ error: removeError }));
        }));
        it('should throw ForbiddenError if admin lacks permission', () => __awaiter(void 0, void 0, void 0, function* () {
            yield expect(service.removeRoleFromGroup(adminUser_mock_1.mockNonAdminUser, groupName, roleName)).rejects.toHaveProperty('statusCode', 403);
            expect(assignmentRepository.removeRoleFromGroup).not.toHaveBeenCalled();
        }));
    });
    // --- NEW: listRolesForGroup ---
    describe('listRolesForGroup', () => {
        const groupName = 'list-roles-group';
        const mockCognitoGroup = { GroupName: groupName, UserPoolId: 'pool-id' };
        const roleNames = ['roleA', 'roleB'];
        it('should validate group existence and return roles from assignment repo', () => __awaiter(void 0, void 0, void 0, function* () {
            adapter.adminGetGroup.mockResolvedValue(mockCognitoGroup); // Group exists
            assignmentRepository.findRolesByGroupName.mockResolvedValue(roleNames);
            const result = yield service.listRolesForGroup(adminUser_mock_1.mockAdminUser, groupName);
            expect(result).toEqual(roleNames);
            expect(adapter.adminGetGroup).toHaveBeenCalledWith(groupName);
            expect(assignmentRepository.findRolesByGroupName).toHaveBeenCalledWith(groupName);
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('successfully listed 2 roles'), expect.any(Object));
        }));
        it('should throw GroupNotFoundError if cognito group does not exist', () => __awaiter(void 0, void 0, void 0, function* () {
            adapter.adminGetGroup.mockResolvedValue(null); // Group NOT found
            yield expect(service.listRolesForGroup(adminUser_mock_1.mockAdminUser, groupName))
                .rejects.toThrow(UserManagementError_1.GroupNotFoundError);
            expect(assignmentRepository.findRolesByGroupName).not.toHaveBeenCalled();
        }));
        it('should throw error if assignment repo fails', () => __awaiter(void 0, void 0, void 0, function* () {
            adapter.adminGetGroup.mockResolvedValue(mockCognitoGroup);
            const listError = new Error("DB list failed");
            assignmentRepository.findRolesByGroupName.mockRejectedValue(listError);
            yield expect(service.listRolesForGroup(adminUser_mock_1.mockAdminUser, groupName))
                .rejects.toThrow(listError); // Re-throws original error
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('failed to list roles'), expect.objectContaining({ error: listError }));
        }));
        it('should throw ForbiddenError if admin lacks permission', () => __awaiter(void 0, void 0, void 0, function* () {
            yield expect(service.listRolesForGroup(adminUser_mock_1.mockNonAdminUser, groupName)).rejects.toHaveProperty('statusCode', 403);
            expect(adapter.adminGetGroup).not.toHaveBeenCalled();
            expect(assignmentRepository.findRolesByGroupName).not.toHaveBeenCalled();
        }));
    });
});
