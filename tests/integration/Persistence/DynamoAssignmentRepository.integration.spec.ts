import 'reflect-metadata'; // Required for tsyringe
import { IConfigService } from '../../../src/application/interfaces/IConfigService';
import { IAssignmentRepository } from '../../../src/application/interfaces/IAssignmentRepository';
import { TYPES } from '../../../src/shared/constants/types';
import { clearTestTable, docClient } from '../../helpers/dynamodb.helper';
import { persistenceContainer } from '../../helpers/persistence.helper';
import { DynamoAssignmentRepository } from '../../../src/infrastructure/persistence/dynamodb/DynamoAssignmentRepository';
import { ScalarAttributeType, KeyType, ProjectionType } from "@aws-sdk/client-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBProvider } from '../../../src/infrastructure/persistence/dynamodb/dynamodb.client';
import { mockConfigService } from '../../mocks/config.mock';

describe('DynamoAssignmentRepository Integration Tests - Minimal', () => {
    let assignmentRepository: IAssignmentRepository;
    let configService: IConfigService;
    let tableName: string = 'TestAssignments';

    // Define the schema for the Assignment table
    const assignmentTableKeySchema = [
        { AttributeName: "PK", KeyType: KeyType.HASH },
        { AttributeName: "SK", KeyType: KeyType.RANGE }
    ];

    beforeAll(() => {
        // Resolve configService first to apply mockImplementation
        configService = persistenceContainer.resolve<IConfigService>(TYPES.ConfigService);

        // Temporarily override the AUTHZ_TABLE_NAME for this specific test
        (configService.getOrThrow as jest.Mock).mockImplementation((key: string) => {
            if (key === 'AUTHZ_TABLE_NAME') return tableName;
            // Fallback to original mock implementation for other keys
            return mockConfigService.getOrThrow(key);
        });

        // Register the real repository implementation in our test container
        persistenceContainer.register<IAssignmentRepository>(TYPES.AssignmentRepository, {
            useClass: DynamoAssignmentRepository,
        });

        // Register the DynamoDBClient
        persistenceContainer.register(DynamoDBClient, {
            useFactory: () => {
                return new DynamoDBClient({
                    region: "ap-south-1",
                });
            },
        });

        // Register the DynamoDBProvider
        persistenceContainer.register(TYPES.DynamoDBProvider, {
            useFactory: (c) => {
                const client = c.resolve(DynamoDBClient);
                const config = c.resolve<IConfigService>(TYPES.ConfigService);
                // Temporarily override the AUTHZ_TABLE_NAME for this specific test
                (config.getOrThrow as jest.Mock).mockImplementation((key: string) => {
                    if (key === 'AUTHZ_TABLE_NAME') return tableName;
                    // Fallback to original mock implementation for other keys
                    return mockConfigService.getOrThrow(key);
                });
                return new DynamoDBProvider(config, tableName, client);
            },
        });

        // Resolve assignmentRepository after all registrations
        assignmentRepository = persistenceContainer.resolve<IAssignmentRepository>(TYPES.AssignmentRepository);
    });

    beforeEach(async () => {
        await clearTestTable(tableName, assignmentTableKeySchema);
    });

    it('should assign a role to a group', async () => {
        const groupName = 'test-group';
        const roleName = 'test-role';
        await expect(assignmentRepository.assignRoleToGroup(groupName, roleName)).resolves.not.toThrow();

        // Verify by finding roles for the group
        const roles = await assignmentRepository.findRolesByGroupName(groupName);
        expect(roles).toContain(roleName);
    });

    it('should remove a role from a group', async () => {
        const groupName = 'test-group-remove';
        const roleName = 'test-role-remove';
        await assignmentRepository.assignRoleToGroup(groupName, roleName);

        let roles = await assignmentRepository.findRolesByGroupName(groupName);
        expect(roles).toContain(roleName);

        await expect(assignmentRepository.removeRoleFromGroup(groupName, roleName)).resolves.not.toThrow();

        roles = await assignmentRepository.findRolesByGroupName(groupName);
        expect(roles).not.toContain(roleName);
    });

    it('should find roles by group name', async () => {
        const groupName = 'find-group';
        const role1 = 'role-a';
        const role2 = 'role-b';
        await assignmentRepository.assignRoleToGroup(groupName, role1);
        await assignmentRepository.assignRoleToGroup(groupName, role2);

        const roles = await assignmentRepository.findRolesByGroupName(groupName);
        expect(roles).toEqual(expect.arrayContaining([role1, role2]));
        expect(roles).toHaveLength(2);
    });

    it('should find groups by role name', async () => {
        const group1 = 'group-x';
        const group2 = 'group-y';
        const roleName = 'find-role';
        await assignmentRepository.assignRoleToGroup(group1, roleName);
        await assignmentRepository.assignRoleToGroup(group2, roleName);

        const groups = await assignmentRepository.findGroupsByRoleName(roleName);
        expect(groups).toEqual(expect.arrayContaining([group1, group2]));
        expect(groups).toHaveLength(2);
    });

    it('should return an empty array when finding roles for a non-existent group', async () => {
        const nonExistentGroupName = 'non-existent-group';
        const roles = await assignmentRepository.findRolesByGroupName(nonExistentGroupName);
        expect(roles).toEqual([]);
    });

    it('should return an empty array when finding groups for a non-existent role', async () => {
        const nonExistentRoleName = 'non-existent-role';
        const groups = await assignmentRepository.findGroupsByRoleName(nonExistentRoleName);
        expect(groups).toEqual([]);
    });

    // Role <-> Permission Assignments
    it('should assign a permission to a role and find it', async () => {
        const roleName = 'test-role-perm';
        const permissionName = 'test-permission';

        await expect(assignmentRepository.assignPermissionToRole(roleName, permissionName)).resolves.not.toThrow();

        const permissions = await assignmentRepository.findPermissionsByRoleName(roleName);
        expect(permissions).toContain(permissionName);
    });

    it('should remove a permission from a role', async () => {
        const roleName = 'test-role-remove-perm';
        const permissionName = 'test-permission-remove';

        await assignmentRepository.assignPermissionToRole(roleName, permissionName);

        let permissions = await assignmentRepository.findPermissionsByRoleName(roleName);
        expect(permissions).toContain(permissionName);

        await expect(assignmentRepository.removePermissionFromRole(roleName, permissionName)).resolves.not.toThrow();

        permissions = await assignmentRepository.findPermissionsByRoleName(roleName);
        expect(permissions).not.toContain(permissionName);
    });

    it('should find roles by permission name', async () => {
        const role1 = 'role-perm-x';
        const role2 = 'role-perm-y';
        const permissionName = 'find-permission';

        await assignmentRepository.assignPermissionToRole(role1, permissionName);
        await assignmentRepository.assignPermissionToRole(role2, permissionName);

        const roles = await assignmentRepository.findRolesByPermissionName(permissionName);
        expect(roles).toEqual(expect.arrayContaining([role1, role2]));
        expect(roles).toHaveLength(2);
    });

    // User <-> Custom Role Assignments
    it('should assign a custom role to a user and find it', async () => {
        const userId = 'user-custom-role-1';
        const roleName = 'custom-role-a';

        await expect(assignmentRepository.assignCustomRoleToUser(userId, roleName)).resolves.not.toThrow();

        const roles = await assignmentRepository.findCustomRolesByUserId(userId);
        expect(roles).toContain(roleName);
    });

    it('should remove a custom role from a user', async () => {
        const userId = 'user-custom-role-remove';
        const roleName = 'custom-role-remove';

        await assignmentRepository.assignCustomRoleToUser(userId, roleName);

        let roles = await assignmentRepository.findCustomRolesByUserId(userId);
        expect(roles).toContain(roleName);

        await expect(assignmentRepository.removeCustomRoleFromUser(userId, roleName)).resolves.not.toThrow();

        roles = await assignmentRepository.findCustomRolesByUserId(userId);
        expect(roles).not.toContain(roleName);
    });

    it('should find users by role name', async () => {
        const user1 = 'user-role-x';
        const user2 = 'user-role-y';
        const roleName = 'find-user-role';

        await assignmentRepository.assignCustomRoleToUser(user1, roleName);
        await assignmentRepository.assignCustomRoleToUser(user2, roleName);

        const users = await assignmentRepository.findUsersByRoleName(roleName);
        expect(users).toEqual(expect.arrayContaining([user1, user2]));
        expect(users).toHaveLength(2);
    });

    // User <-> Custom Permission Assignments
    it('should assign a custom permission to a user and find it', async () => {
        const userId = 'user-custom-perm-1';
        const permissionName = 'custom-permission-a';

        await expect(assignmentRepository.assignCustomPermissionToUser(userId, permissionName)).resolves.not.toThrow();

        const permissions = await assignmentRepository.findCustomPermissionsByUserId(userId);
        expect(permissions).toContain(permissionName);
    });

    it('should remove a custom permission from a user', async () => {
        const userId = 'user-custom-perm-remove';
        const permissionName = 'custom-permission-remove';

        await assignmentRepository.assignCustomPermissionToUser(userId, permissionName);

        let permissions = await assignmentRepository.findCustomPermissionsByUserId(userId);
        expect(permissions).toContain(permissionName);

        await expect(assignmentRepository.removeCustomPermissionFromUser(userId, permissionName)).resolves.not.toThrow();

        permissions = await assignmentRepository.findCustomPermissionsByUserId(userId);
        expect(permissions).not.toContain(permissionName);
    });

    it('should find users by permission name', async () => {
        const user1 = 'user-perm-x';
        const user2 = 'user-perm-y';
        const permissionName = 'find-user-permission';

        await assignmentRepository.assignCustomPermissionToUser(user1, permissionName);
        await assignmentRepository.assignCustomPermissionToUser(user2, permissionName);

        const users = await assignmentRepository.findUsersByPermissionName(permissionName);
        expect(users).toEqual(expect.arrayContaining([user1, user2]));
        expect(users).toHaveLength(2);
    });

    // Cleanup Methods
    it('should remove all assignments for a user', async () => {
        const userId = 'user-to-cleanup';
        const roleName = 'role-for-cleanup';
        const permissionName = 'perm-for-cleanup';

        // Assign a custom role and a custom permission to the user
        await assignmentRepository.assignCustomRoleToUser(userId, roleName);
        await assignmentRepository.assignCustomPermissionToUser(userId, permissionName);

        // Verify assignments exist
        let roles = await assignmentRepository.findCustomRolesByUserId(userId);
        expect(roles).toContain(roleName);
        let permissions = await assignmentRepository.findCustomPermissionsByUserId(userId);
        expect(permissions).toContain(permissionName);

        // Remove all assignments for the user
        await expect(assignmentRepository.removeAllAssignmentsForUser(userId)).resolves.not.toThrow();

        // Verify assignments are removed
        roles = await assignmentRepository.findCustomRolesByUserId(userId);
        expect(roles).not.toContain(roleName);
        expect(roles).toHaveLength(0);
        permissions = await assignmentRepository.findCustomPermissionsByUserId(userId);
        expect(permissions).not.toContain(permissionName);
        expect(permissions).toHaveLength(0);
    });

    it('should remove all assignments for a group', async () => {
        const groupName = 'group-to-cleanup';
        const roleName1 = 'role-for-group-cleanup-1';
        const roleName2 = 'role-for-group-cleanup-2';

        // Assign multiple roles to the group
        await assignmentRepository.assignRoleToGroup(groupName, roleName1);
        await assignmentRepository.assignRoleToGroup(groupName, roleName2);

        // Verify assignments exist
        let roles = await assignmentRepository.findRolesByGroupName(groupName);
        expect(roles).toContain(roleName1);
        expect(roles).toContain(roleName2);
        expect(roles).toHaveLength(2);

        // Remove all assignments for the group
        await expect(assignmentRepository.removeAllAssignmentsForGroup(groupName)).resolves.not.toThrow();

        // Verify assignments are removed
        roles = await assignmentRepository.findRolesByGroupName(groupName);
        expect(roles).not.toContain(roleName1);
        expect(roles).not.toContain(roleName2);
        expect(roles).toHaveLength(0);
    });

    it('should remove all assignments for a role', async () => {
        const roleName = 'role-to-cleanup';
        const permissionName = 'perm-for-role-cleanup';
        const groupName = 'group-for-role-cleanup';
        const userId = 'user-for-role-cleanup';

        // Assign a permission to the role
        await assignmentRepository.assignPermissionToRole(roleName, permissionName);
        await new Promise(resolve => setTimeout(resolve, 200)); // Add delay
        // Assign the role to a group
        await assignmentRepository.assignRoleToGroup(groupName, roleName);
        await new Promise(resolve => setTimeout(resolve, 200)); // Add delay
        // Assign the role to a user
        await assignmentRepository.assignCustomRoleToUser(userId, roleName);
        await new Promise(resolve => setTimeout(resolve, 200)); // Add delay

        // Verify assignments exist
        let permissions = await assignmentRepository.findPermissionsByRoleName(roleName);
        expect(permissions).toContain(permissionName);
        let groups = await assignmentRepository.findGroupsByRoleName(roleName);
        expect(groups).toContain(groupName);
        let users = await assignmentRepository.findUsersByRoleName(roleName);
        expect(users).toContain(userId);

        // Remove all assignments for the role
        await expect(assignmentRepository.removeAllAssignmentsForRole(roleName)).resolves.not.toThrow();

        // Verify assignments are removed
        permissions = await assignmentRepository.findPermissionsByRoleName(roleName);
        expect(permissions).not.toContain(permissionName);
        expect(permissions).toHaveLength(0);
        groups = await assignmentRepository.findGroupsByRoleName(roleName);
        expect(groups).not.toContain(groupName);
        expect(groups).toHaveLength(0);
        users = await assignmentRepository.findUsersByRoleName(roleName);
        expect(users).not.toContain(userId);
        expect(users).toHaveLength(0);
    });

    it('should remove all assignments for a permission', async () => {
        const permissionName = 'permission-to-cleanup';
        const roleName = 'role-for-perm-cleanup';
        const userId = 'user-for-perm-cleanup';

        // Assign the permission to a role
        await assignmentRepository.assignPermissionToRole(roleName, permissionName);
        await new Promise(resolve => setTimeout(resolve, 200)); // Add delay
        // Assign the permission to a user
        await assignmentRepository.assignCustomPermissionToUser(userId, permissionName);
        await new Promise(resolve => setTimeout(resolve, 200)); // Add delay

        // Verify assignments exist
        let roles = await assignmentRepository.findRolesByPermissionName(permissionName);
        expect(roles).toContain(roleName);
        let users = await assignmentRepository.findUsersByPermissionName(permissionName);
        expect(users).toContain(userId);

        // Remove all assignments for the permission
        await expect(assignmentRepository.removeAllAssignmentsForPermission(permissionName)).resolves.not.toThrow();

        // Verify assignments are removed
        roles = await assignmentRepository.findRolesByPermissionName(permissionName);
        expect(roles).not.toContain(roleName);
        expect(roles).toHaveLength(0);
        users = await assignmentRepository.findUsersByPermissionName(permissionName);
        expect(users).not.toContain(userId);
        expect(users).toHaveLength(0);
    });
});
