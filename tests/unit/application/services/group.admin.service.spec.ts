// tests/unit/application/services/group.admin.service.spec.ts

import { GroupType } from '@aws-sdk/client-cognito-identity-provider';
import { IAssignmentRepository } from '../../../../src/application/interfaces/IAssignmentRepository'; // Added
import { ILogger } from '../../../../src/application/interfaces/ILogger';
import { IRoleRepository } from '../../../../src/application/interfaces/IRoleRepository'; // Added
import { CreateGroupDetails, IUserMgmtAdapter } from '../../../../src/application/interfaces/IUserMgmtAdapter';
import { GroupAdminService } from '../../../../src/application/services/group.admin.service';
import { Group } from '../../../../src/domain/entities/Group';
import { Role } from '../../../../src/domain/entities/Role'; // Added
import { AssignmentError, GroupNotFoundError, RoleNotFoundError } from '../../../../src/domain/exceptions/UserManagementError'; // Added
import { BaseError, NotFoundError } from '../../../../src/shared/errors/BaseError';
import { mockUserMgmtAdapter } from '../../../mocks/adapter.mock';
import { mockAdminUser, mockNonAdminUser } from '../../../mocks/adminUser.mock';
import { mockLogger } from '../../../mocks/logger.mock';
import { mockAssignmentRepository, mockRoleRepository } from '../../../mocks/repository.mock'; // Added


describe('GroupAdminService', () => {
    let service: GroupAdminService;
    let adapter: jest.Mocked<IUserMgmtAdapter>;
    let assignmentRepository: jest.Mocked<IAssignmentRepository>; // Added
    let roleRepository: jest.Mocked<IRoleRepository>;             // Added
    let logger: jest.Mocked<ILogger>;

    beforeEach(() => {
        jest.clearAllMocks();
        adapter = { ...mockUserMgmtAdapter } as jest.Mocked<IUserMgmtAdapter>;
        assignmentRepository = { ...mockAssignmentRepository } as jest.Mocked<IAssignmentRepository>; // Initialize
        roleRepository = { ...mockRoleRepository } as jest.Mocked<IRoleRepository>;             // Initialize
        logger = { ...mockLogger } as jest.Mocked<ILogger>;
        // Update constructor call with new dependencies
        service = new GroupAdminService(adapter, assignmentRepository, roleRepository, logger);
    });

    // --- createGroup (No changes needed if create doesn't involve assignments) ---
    describe('createGroup', () => {
        // ... tests remain the same ...
        const groupDetails: CreateGroupDetails = { groupName: 'new-group', description: 'A new group' };
        const mockCognitoGroup: GroupType = {
            GroupName: groupDetails.groupName, Description: groupDetails.description,
            UserPoolId: 'pool-id', CreationDate: new Date(), LastModifiedDate: new Date(),
        };

        it('should call adapter.adminCreateGroup and return mapped Group on success', async () => {
            adapter.adminCreateGroup.mockResolvedValue(mockCognitoGroup);
            const result = await service.createGroup(mockAdminUser, groupDetails);
            expect(result).toBeInstanceOf(Group); // etc.
            expect(adapter.adminCreateGroup).toHaveBeenCalledWith(groupDetails);
        });
        // ... other createGroup tests ...
    });

    // --- getGroup (No changes needed) ---
    describe('getGroup', () => {
        // ... tests remain the same ...
        const groupName = 'existing-group';
        const mockCognitoGroup: GroupType = { GroupName: groupName, UserPoolId: 'pool-id', /*...*/ };
        it('should call adapter.adminGetGroup and return mapped Group if found', async () => {
            adapter.adminGetGroup.mockResolvedValue(mockCognitoGroup);
            const result = await service.getGroup(mockAdminUser, groupName);
            expect(result).toBeInstanceOf(Group); // etc.
        });
        // ... other getGroup tests ...
    });

    // --- listGroups (No changes needed) ---
    describe('listGroups', () => {
        const mockCognitoGroup1: GroupType = {
            GroupName: 'group1',
            UserPoolId: 'pool-id',
            Description: 'Group One',
            CreationDate: new Date(),
            LastModifiedDate: new Date(),
            Precedence: 10
        };
        // ... tests remain the same ...
        const mockCognitoGroups: GroupType[] = [mockCognitoGroup1];

        it('should call adapter.adminListGroups and return mapped Groups and token', async () => {
            // FIX: Use the defined mock data in the resolved value
            adapter.adminListGroups.mockResolvedValue({ groups: mockCognitoGroups, nextToken: 'token123' });

            // Call the service
            const result = await service.listGroups(mockAdminUser, 10, 'startToken');

            // Assertions based on the mock data provided
            expect(result.groups).toHaveLength(1); // Now expects length 1
            expect(result.groups[0]).toBeInstanceOf(Group);
            expect(result.groups[0].groupName).toBe('group1');
            expect(result.groups[0].description).toBe('Group One'); // Check mapped fields
            expect(result.nextToken).toBe('token123');
            expect(adapter.adminListGroups).toHaveBeenCalledWith(10, 'startToken');
            // Log message should reflect the actual number of groups mapped
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('successfully listed 1 groups'), expect.any(Object));
        });

        it('should handle empty list from adapter', async () => {
            // This test remains correct
            adapter.adminListGroups.mockResolvedValue({ groups: [], nextToken: undefined });
            const result = await service.listGroups(mockAdminUser);
            expect(result.groups).toHaveLength(0);
            expect(result.nextToken).toBeUndefined();
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('successfully listed 0 groups'), expect.any(Object));
        });
        // ... other listGroups tests ...
    });

    // --- deleteGroup (UPDATED TESTS) ---
    describe('deleteGroup', () => {
        const groupName = 'group-to-delete';

        it('should delete cognito group and cleanup assignments successfully', async () => {
            adapter.adminDeleteGroup.mockResolvedValue(undefined); // Cognito delete success
            assignmentRepository.removeAllAssignmentsForGroup.mockResolvedValue(undefined); // Cleanup success

            await service.deleteGroup(mockAdminUser, groupName);

            expect(adapter.adminDeleteGroup).toHaveBeenCalledWith(groupName);
            expect(assignmentRepository.removeAllAssignmentsForGroup).toHaveBeenCalledWith(groupName);
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Admin successfully deleted Cognito group ${groupName}`), expect.any(Object));
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Successfully cleaned up assignments for deleted group ${groupName}`), expect.any(Object));
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Admin successfully deleted group '${groupName}' and cleaned up assignments`), expect.any(Object));
            expect(logger.error).not.toHaveBeenCalled(); // No errors logged
        });

        it('should throw ForbiddenError if admin user lacks permission', async () => {
            await expect(service.deleteGroup(mockNonAdminUser, groupName))
                .rejects.toHaveProperty('statusCode', 403);
            expect(adapter.adminDeleteGroup).not.toHaveBeenCalled();
            expect(assignmentRepository.removeAllAssignmentsForGroup).not.toHaveBeenCalled();
        });

        it('should throw GroupNotFoundError if cognito group deletion fails with NotFound', async () => {
            // Simulate adapter throwing mapped NotFoundError
            const error = new NotFoundError('Group'); // Or specific GroupNotFoundError if mapped
            adapter.adminDeleteGroup.mockRejectedValue(error);

            await expect(service.deleteGroup(mockAdminUser, groupName))
                .rejects.toThrow(GroupNotFoundError); // Expect service to throw specific error
            expect(adapter.adminDeleteGroup).toHaveBeenCalledWith(groupName);
            expect(assignmentRepository.removeAllAssignmentsForGroup).not.toHaveBeenCalled(); // Cleanup not called
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('failed to delete Cognito group'), expect.any(Object));
        });

        it('should re-throw other errors from cognito group deletion', async () => {
            const error = new Error("Cognito internal delete error");
            adapter.adminDeleteGroup.mockRejectedValue(error);
            await expect(service.deleteGroup(mockAdminUser, groupName)).rejects.toThrow(error);
            expect(assignmentRepository.removeAllAssignmentsForGroup).not.toHaveBeenCalled();
        });

        it('should delete cognito group but throw CleanupFailedError if assignment cleanup fails', async () => {
            adapter.adminDeleteGroup.mockResolvedValue(undefined); // Cognito delete success
            const cleanupError = new Error("DynamoDB cleanup failed");
            assignmentRepository.removeAllAssignmentsForGroup.mockRejectedValue(cleanupError); // Cleanup fails

            await expect(service.deleteGroup(mockAdminUser, groupName))
                .rejects.toThrow(BaseError); // Expect the wrapped BaseError
            await expect(service.deleteGroup(mockAdminUser, groupName))
                .rejects.toHaveProperty('name', 'CleanupFailedError');
            await expect(service.deleteGroup(mockAdminUser, groupName))
                .rejects.toThrow(/failed to remove associated role assignments/);

            expect(adapter.adminDeleteGroup).toHaveBeenCalledWith(groupName);
            expect(assignmentRepository.removeAllAssignmentsForGroup).toHaveBeenCalledWith(groupName);
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Admin successfully deleted Cognito group ${groupName}`), expect.any(Object));
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to cleanup assignments'), expect.objectContaining({ error: cleanupError }));
            // Final success log should NOT be called
            expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('deleted group \'group-to-delete\' and cleaned up assignments'), expect.any(Object));
        });
    });

    // --- NEW: assignRoleToGroup ---
    describe('assignRoleToGroup', () => {
        const groupName = 'assign-test-group';
        const roleName = 'assign-test-role';
        const mockCognitoGroup: GroupType = { GroupName: groupName, UserPoolId: 'pool-id' };
        const mockRole = new Role(roleName);

        it('should validate existence and call assignment repo on success', async () => {
            adapter.adminGetGroup.mockResolvedValue(mockCognitoGroup); // Group exists
            roleRepository.findByName.mockResolvedValue(mockRole); // Role exists
            assignmentRepository.assignRoleToGroup.mockResolvedValue(undefined); // Assign succeeds

            await service.assignRoleToGroup(mockAdminUser, groupName, roleName);

            expect(adapter.adminGetGroup).toHaveBeenCalledWith(groupName);
            expect(roleRepository.findByName).toHaveBeenCalledWith(roleName);
            expect(assignmentRepository.assignRoleToGroup).toHaveBeenCalledWith(groupName, roleName);
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('successfully assigned role'), expect.any(Object));
        });

        it('should throw GroupNotFoundError if cognito group does not exist', async () => {
            adapter.adminGetGroup.mockResolvedValue(null); // Group NOT found
            roleRepository.findByName.mockResolvedValue(mockRole); // Role exists

            await expect(service.assignRoleToGroup(mockAdminUser, groupName, roleName))
                .rejects.toThrow(GroupNotFoundError);
            expect(roleRepository.findByName).not.toHaveBeenCalled(); // Role check skipped
            expect(assignmentRepository.assignRoleToGroup).not.toHaveBeenCalled();
        });

        it('should throw RoleNotFoundError if custom role does not exist', async () => {
            adapter.adminGetGroup.mockResolvedValue(mockCognitoGroup); // Group exists
            roleRepository.findByName.mockResolvedValue(null); // Role NOT found

            await expect(service.assignRoleToGroup(mockAdminUser, groupName, roleName))
                .rejects.toThrow(RoleNotFoundError);
            expect(assignmentRepository.assignRoleToGroup).not.toHaveBeenCalled();
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(`Role '${roleName}' not found`), expect.any(Object));
        });

        it('should throw AssignmentError if assignment repo fails', async () => {
            adapter.adminGetGroup.mockResolvedValue(mockCognitoGroup);
            roleRepository.findByName.mockResolvedValue(mockRole);
            const assignError = new Error("DB assign failed");
            assignmentRepository.assignRoleToGroup.mockRejectedValue(assignError);

            await expect(service.assignRoleToGroup(mockAdminUser, groupName, roleName))
                .rejects.toThrow(AssignmentError);
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('failed to assign role'), expect.objectContaining({ error: assignError }));
        });

        it('should throw ForbiddenError if admin lacks permission', async () => {
            await expect(service.assignRoleToGroup(mockNonAdminUser, groupName, roleName)).rejects.toHaveProperty('statusCode', 403);
            expect(adapter.adminGetGroup).not.toHaveBeenCalled();
            expect(roleRepository.findByName).not.toHaveBeenCalled();
            expect(assignmentRepository.assignRoleToGroup).not.toHaveBeenCalled();
        });
    });

    // --- NEW: removeRoleFromGroup ---
    describe('removeRoleFromGroup', () => {
        const groupName = 'remove-test-group';
        const roleName = 'remove-test-role';

        it('should call assignment repo remove successfully', async () => {
            assignmentRepository.removeRoleFromGroup.mockResolvedValue(undefined);

            await service.removeRoleFromGroup(mockAdminUser, groupName, roleName);

            expect(assignmentRepository.removeRoleFromGroup).toHaveBeenCalledWith(groupName, roleName);
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('successfully removed role'), expect.any(Object));
        });

        it('should throw AssignmentError if assignment repo fails', async () => {
            const removeError = new Error("DB remove failed");
            assignmentRepository.removeRoleFromGroup.mockRejectedValue(removeError);

            await expect(service.removeRoleFromGroup(mockAdminUser, groupName, roleName))
                .rejects.toThrow(AssignmentError);
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('failed to remove role'), expect.objectContaining({ error: removeError }));
        });

        it('should throw ForbiddenError if admin lacks permission', async () => {
            await expect(service.removeRoleFromGroup(mockNonAdminUser, groupName, roleName)).rejects.toHaveProperty('statusCode', 403);
            expect(assignmentRepository.removeRoleFromGroup).not.toHaveBeenCalled();
        });
    });

    // --- NEW: listRolesForGroup ---
    describe('listRolesForGroup', () => {
        const groupName = 'list-roles-group';
        const mockCognitoGroup: GroupType = { GroupName: groupName, UserPoolId: 'pool-id' };
        const roleNames = ['roleA', 'roleB'];

        it('should validate group existence and return roles from assignment repo', async () => {
            adapter.adminGetGroup.mockResolvedValue(mockCognitoGroup); // Group exists
            assignmentRepository.findRolesByGroupName.mockResolvedValue(roleNames);

            const result = await service.listRolesForGroup(mockAdminUser, groupName);

            expect(result).toEqual(roleNames);
            expect(adapter.adminGetGroup).toHaveBeenCalledWith(groupName);
            expect(assignmentRepository.findRolesByGroupName).toHaveBeenCalledWith(groupName);
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('successfully listed 2 roles'), expect.any(Object));
        });

        it('should throw GroupNotFoundError if cognito group does not exist', async () => {
            adapter.adminGetGroup.mockResolvedValue(null); // Group NOT found

            await expect(service.listRolesForGroup(mockAdminUser, groupName))
                .rejects.toThrow(GroupNotFoundError);
            expect(assignmentRepository.findRolesByGroupName).not.toHaveBeenCalled();
        });

        it('should throw error if assignment repo fails', async () => {
            adapter.adminGetGroup.mockResolvedValue(mockCognitoGroup);
            const listError = new Error("DB list failed");
            assignmentRepository.findRolesByGroupName.mockRejectedValue(listError);

            await expect(service.listRolesForGroup(mockAdminUser, groupName))
                .rejects.toThrow(listError); // Re-throws original error
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('failed to list roles'), expect.objectContaining({ error: listError }));
        });

        it('should throw ForbiddenError if admin lacks permission', async () => {
            await expect(service.listRolesForGroup(mockNonAdminUser, groupName)).rejects.toHaveProperty('statusCode', 403);
            expect(adapter.adminGetGroup).not.toHaveBeenCalled();
            expect(assignmentRepository.findRolesByGroupName).not.toHaveBeenCalled();
        });
    });
});