// tests/integration/DynamoAssignmentRepository.integration.spec.ts
import 'reflect-metadata';
import { IAssignmentRepository } from '../../../src/application/interfaces/IAssignmentRepository';

import { container } from 'tsyringe';

import { TYPES } from '../../../src/shared/constants/types';
import { createTestTable, deleteTestTable, clearTestTable, destroyDynamoDBClient, setupIntegrationTest } from '../../helpers/dynamodb.helper';


describe('DynamoAssignmentRepository Integration Tests', () => {
    let assignmentRepository: IAssignmentRepository;

    const group1 = 'grp-editors';
    const group2 = 'grp-viewers';
    const role1 = 'role-doc-editor';
    const role2 = 'role-doc-viewer';
    const perm1 = 'perm-doc-edit';
    const perm2 = 'perm-doc-view';
    const user1 = 'user-alice';
    const user2 = 'user-bob';


    beforeAll(async () => {
        setupIntegrationTest(); // Setup container with test config
        assignmentRepository = container.resolve<IAssignmentRepository>(TYPES.AssignmentRepository);
        await createTestTable(); // Create the test table
    });

    afterAll(async () => {
        await deleteTestTable(); // Clean up the test table
        destroyDynamoDBClient(); // Destroy the DynamoDB client
    });

    beforeEach(async () => {
        await clearTestTable(); // Clear table before each test
    });

    describe('Group <-> Role Assignments', () => {
        it('should assign and find roles for a group', async () => {
            await assignmentRepository.assignRoleToGroup(group1, role1);
            await assignmentRepository.assignRoleToGroup(group1, role2);

            const roles = await assignmentRepository.findRolesByGroupName(group1);
            expect(roles).toHaveLength(2);
            expect(roles).toContain(role1);
            expect(roles).toContain(role2);
        });

        it('should find groups for a role (reverse lookup)', async () => {
            await assignmentRepository.assignRoleToGroup(group1, role1);
            await assignmentRepository.assignRoleToGroup(group2, role1); // Role1 assigned to two groups

            const groups = await assignmentRepository.findGroupsByRoleName(role1);
            expect(groups).toHaveLength(2);
            expect(groups).toContain(group1);
            expect(groups).toContain(group2);
        });

        it('should remove a role assignment from a group', async () => {
            await assignmentRepository.assignRoleToGroup(group1, role1);
            await assignmentRepository.assignRoleToGroup(group1, role2);

            await assignmentRepository.removeRoleFromGroup(group1, role1);

            const roles = await assignmentRepository.findRolesByGroupName(group1);
            expect(roles).toHaveLength(1);
            expect(roles).toContain(role2);
            expect(roles).not.toContain(role1);
        });

        it('findRolesByGroupName should return empty array if no assignments', async () => {
            const roles = await assignmentRepository.findRolesByGroupName('nonexistent-group');
            expect(roles).toEqual([]);
        });
        it('findGroupsByRoleName should return empty array if no assignments', async () => {
            const groups = await assignmentRepository.findGroupsByRoleName('nonexistent-role');
            expect(groups).toEqual([]);
        });
    });

    describe('Role <-> Permission Assignments', () => {
        it('should assign and find permissions for a role', async () => {
            await assignmentRepository.assignPermissionToRole(role1, perm1);
            await assignmentRepository.assignPermissionToRole(role1, perm2);

            const perms = await assignmentRepository.findPermissionsByRoleName(role1);
            expect(perms).toHaveLength(2);
            expect(perms).toContain(perm1);
            expect(perms).toContain(perm2);
        });

        it('should find roles for a permission (reverse lookup)', async () => {
            await assignmentRepository.assignPermissionToRole(role1, perm2);
            await assignmentRepository.assignPermissionToRole(role2, perm2); // Perm2 assigned to two roles

            const roles = await assignmentRepository.findRolesByPermissionName(perm2);
            expect(roles).toHaveLength(2);
            expect(roles).toContain(role1);
            expect(roles).toContain(role2);
        });

        it('should remove a permission assignment from a role', async () => {
            await assignmentRepository.assignPermissionToRole(role1, perm1);
            await assignmentRepository.assignPermissionToRole(role1, perm2);
            await assignmentRepository.removePermissionFromRole(role1, perm2);
            const perms = await assignmentRepository.findPermissionsByRoleName(role1);
            expect(perms).toHaveLength(1);
            expect(perms).toContain(perm1);
        });

        // Add empty array tests
    });

    describe('User <-> Custom Role/Permission Assignments', () => {
        it('should assign and find custom roles for a user', async () => {
            await assignmentRepository.assignCustomRoleToUser(user1, role1);
            const roles = await assignmentRepository.findCustomRolesByUserId(user1);
            expect(roles).toEqual([role1]);
        });

        it('should assign and find custom permissions for a user', async () => {
            await assignmentRepository.assignCustomPermissionToUser(user1, perm1);
            const perms = await assignmentRepository.findCustomPermissionsByUserId(user1);
            expect(perms).toEqual([perm1]);
        });

        it('should remove custom role/permission assignments', async () => {
            await assignmentRepository.assignCustomRoleToUser(user1, role1);
            await assignmentRepository.removeCustomRoleFromUser(user1, role1);
            const roles = await assignmentRepository.findCustomRolesByUserId(user1);
            expect(roles).toEqual([]);

            await assignmentRepository.assignCustomPermissionToUser(user1, perm1);
            await assignmentRepository.removeCustomPermissionFromUser(user1, perm1);
            const perms = await assignmentRepository.findCustomPermissionsByUserId(user1);
            expect(perms).toEqual([]);
        });
    });

    // Note: Tests for removeAllAssignmentsFor* would require seeding more complex data
    // and verifying the BatchWriteCommand call or the resulting state.
    // These are complex and depend on the yet-to-be-implemented logic.
});