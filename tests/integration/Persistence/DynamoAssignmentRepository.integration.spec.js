"use strict";
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
// tests/integration/DynamoAssignmentRepository.integration.spec.ts
require("reflect-metadata");
const container_1 = require("../../../src/container");
const types_1 = require("../../../src/shared/constants/types");
const dynamodb_helper_1 = require("../../helpers/dynamodb.helper");
// Import helper to seed data if needed, or create directly in tests
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb"); // For potential direct cleanup
const dynamodb_helper_2 = require("../../helpers/dynamodb.helper");
describe('DynamoAssignmentRepository Integration Tests', () => {
    let assignmentRepository;
    // Optional: Get client directly for cleanup if clearTable helper not used
    // const docClient = getTestDocumentClient();
    const group1 = 'grp-editors';
    const group2 = 'grp-viewers';
    const role1 = 'role-doc-editor';
    const role2 = 'role-doc-viewer';
    const perm1 = 'perm-doc-edit';
    const perm2 = 'perm-doc-view';
    const user1 = 'user-alice';
    const user2 = 'user-bob';
    beforeAll(() => {
        process.env.AUTHZ_TABLE_NAME = dynamodb_helper_1.TEST_TABLE_NAME;
        assignmentRepository = container_1.container.resolve(types_1.TYPES.AssignmentRepository);
    });
    // Add cleanup before/after each test
    // Example: Delete specific items created during the test
    afterEach(() => __awaiter(void 0, void 0, void 0, function* () {
        // Cleanup: Delete items created in tests to avoid interference
        // This is manual; a clearTable helper is better for complex scenarios
        const keysToDelete = [
            { PK: `GROUP#${group1}`, SK: `ROLE#${role1}` },
            { PK: `GROUP#${group1}`, SK: `ROLE#${role2}` },
            { PK: `ROLE#${role1}`, SK: `PERM#${perm1}` },
            { PK: `ROLE#${role1}`, SK: `PERM#${perm2}` },
            { PK: `ROLE#${role2}`, SK: `PERM#${perm2}` },
            { PK: `USER#${user1}`, SK: `ROLE#${role1}` },
            { PK: `USER#${user1}`, SK: `PERM#${perm1}` },
            { PK: `USER#${user2}`, SK: `ROLE#${role2}` },
        ];
        const docClient = (0, dynamodb_helper_2.getTestDocumentClient)(); // Get client for cleanup
        for (const key of keysToDelete) {
            try {
                yield docClient.send(new lib_dynamodb_1.DeleteCommand({ TableName: dynamodb_helper_1.TEST_TABLE_NAME, Key: key }));
            }
            catch (e) { /* ignore if item doesn't exist */ }
        }
    }));
    describe('Group <-> Role Assignments', () => {
        it('should assign and find roles for a group', () => __awaiter(void 0, void 0, void 0, function* () {
            yield assignmentRepository.assignRoleToGroup(group1, role1);
            yield assignmentRepository.assignRoleToGroup(group1, role2);
            const roles = yield assignmentRepository.findRolesByGroupName(group1);
            expect(roles).toHaveLength(2);
            expect(roles).toContain(role1);
            expect(roles).toContain(role2);
        }));
        it('should find groups for a role (reverse lookup)', () => __awaiter(void 0, void 0, void 0, function* () {
            yield assignmentRepository.assignRoleToGroup(group1, role1);
            yield assignmentRepository.assignRoleToGroup(group2, role1); // Role1 assigned to two groups
            const groups = yield assignmentRepository.findGroupsByRoleName(role1);
            expect(groups).toHaveLength(2);
            expect(groups).toContain(group1);
            expect(groups).toContain(group2);
        }));
        it('should remove a role assignment from a group', () => __awaiter(void 0, void 0, void 0, function* () {
            yield assignmentRepository.assignRoleToGroup(group1, role1);
            yield assignmentRepository.assignRoleToGroup(group1, role2);
            yield assignmentRepository.removeRoleFromGroup(group1, role1);
            const roles = yield assignmentRepository.findRolesByGroupName(group1);
            expect(roles).toHaveLength(1);
            expect(roles).toContain(role2);
            expect(roles).not.toContain(role1);
        }));
        it('findRolesByGroupName should return empty array if no assignments', () => __awaiter(void 0, void 0, void 0, function* () {
            const roles = yield assignmentRepository.findRolesByGroupName('nonexistent-group');
            expect(roles).toEqual([]);
        }));
        it('findGroupsByRoleName should return empty array if no assignments', () => __awaiter(void 0, void 0, void 0, function* () {
            const groups = yield assignmentRepository.findGroupsByRoleName('nonexistent-role');
            expect(groups).toEqual([]);
        }));
    });
    describe('Role <-> Permission Assignments', () => {
        it('should assign and find permissions for a role', () => __awaiter(void 0, void 0, void 0, function* () {
            yield assignmentRepository.assignPermissionToRole(role1, perm1);
            yield assignmentRepository.assignPermissionToRole(role1, perm2);
            const perms = yield assignmentRepository.findPermissionsByRoleName(role1);
            expect(perms).toHaveLength(2);
            expect(perms).toContain(perm1);
            expect(perms).toContain(perm2);
        }));
        it('should find roles for a permission (reverse lookup)', () => __awaiter(void 0, void 0, void 0, function* () {
            yield assignmentRepository.assignPermissionToRole(role1, perm2);
            yield assignmentRepository.assignPermissionToRole(role2, perm2); // Perm2 assigned to two roles
            const roles = yield assignmentRepository.findRolesByPermissionName(perm2);
            expect(roles).toHaveLength(2);
            expect(roles).toContain(role1);
            expect(roles).toContain(role2);
        }));
        it('should remove a permission assignment from a role', () => __awaiter(void 0, void 0, void 0, function* () {
            yield assignmentRepository.assignPermissionToRole(role1, perm1);
            yield assignmentRepository.assignPermissionToRole(role1, perm2);
            yield assignmentRepository.removePermissionFromRole(role1, perm2);
            const perms = yield assignmentRepository.findPermissionsByRoleName(role1);
            expect(perms).toHaveLength(1);
            expect(perms).toContain(perm1);
        }));
        // Add empty array tests
    });
    describe('User <-> Custom Role/Permission Assignments', () => {
        it('should assign and find custom roles for a user', () => __awaiter(void 0, void 0, void 0, function* () {
            yield assignmentRepository.assignCustomRoleToUser(user1, role1);
            const roles = yield assignmentRepository.findCustomRolesByUserId(user1);
            expect(roles).toEqual([role1]);
        }));
        it('should assign and find custom permissions for a user', () => __awaiter(void 0, void 0, void 0, function* () {
            yield assignmentRepository.assignCustomPermissionToUser(user1, perm1);
            const perms = yield assignmentRepository.findCustomPermissionsByUserId(user1);
            expect(perms).toEqual([perm1]);
        }));
        it('should remove custom role/permission assignments', () => __awaiter(void 0, void 0, void 0, function* () {
            yield assignmentRepository.assignCustomRoleToUser(user1, role1);
            yield assignmentRepository.removeCustomRoleFromUser(user1, role1);
            const roles = yield assignmentRepository.findCustomRolesByUserId(user1);
            expect(roles).toEqual([]);
            yield assignmentRepository.assignCustomPermissionToUser(user1, perm1);
            yield assignmentRepository.removeCustomPermissionFromUser(user1, perm1);
            const perms = yield assignmentRepository.findCustomPermissionsByUserId(user1);
            expect(perms).toEqual([]);
        }));
    });
    // Note: Tests for removeAllAssignmentsFor* would require seeding more complex data
    // and verifying the BatchWriteCommand call or the resulting state.
    // These are complex and depend on the yet-to-be-implemented logic.
});
