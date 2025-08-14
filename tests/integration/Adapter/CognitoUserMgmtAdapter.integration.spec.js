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
// tests/integration/CognitoUserMgmtAdapter.integration.spec.ts
require("reflect-metadata");
const container_1 = require("../../../src/container");
const UserManagementError_1 = require("../../../src/domain/exceptions/UserManagementError"); // Assuming mapped errors
const types_1 = require("../../../src/shared/constants/types");
const BaseError_1 = require("../../../src/shared/errors/BaseError");
// ********** IMPORTANT WARNING **********
// These tests interact with a REAL AWS Cognito User Pool.
// 1. Ensure you are using a DEDICATED TEST pool, not production.
// 2. Ensure the test environment has AWS credentials configured with
//    NECESSARY ADMIN PERMISSIONS for this test pool.
// 3. These tests create and delete real resources, which may incur costs
//    and can be slower and potentially flaky.
// 4. Consider extensive cleanup logic in afterEach/afterAll.
// 5. It's often preferable to rely on UNIT tests mocking the SDK client
//    for CI/CD and use these integration tests sparingly for sanity checks.
// ***************************************
// Flag to enable/disable these tests easily
const RUN_COGNITO_INTEGRATION_TESTS = process.env.RUN_COGNITO_INTEGRATION_TESTS === 'true';
// Use describe.skip unless the flag is explicitly set
const cognitoDescribe = RUN_COGNITO_INTEGRATION_TESTS ? describe : describe.skip;
cognitoDescribe('CognitoUserMgmtAdapter Integration Tests', () => {
    let adapter;
    let configService;
    let createdUsernames = []; // Keep track of created users for cleanup
    let createdGroupNames = []; // Keep track of created groups for cleanup
    // Increase timeout for AWS interactions
    jest.setTimeout(30000); // 30 seconds
    beforeAll(() => {
        // Resolve the adapter instance - assumes container is configured with REAL credentials for test pool
        // Ensure COGNITO_USER_POOL_ID points to the TEST pool in the test env
        try {
            adapter = container_1.container.resolve(types_1.TYPES.UserMgmtAdapter);
            configService = container_1.container.resolve(types_1.TYPES.ConfigService);
            const testPoolId = configService.getOrThrow('COGNITO_USER_POOL_ID');
            // Basic check to ensure adapter seems configured
            if (!testPoolId || testPoolId.toLowerCase().includes('prod')) { // Example check if prop accessible
                throw new Error("Cognito adapter test running without TEST user pool ID configured. ABORTING.");
            }
            console.warn(`Running Cognito integration tests against User Pool ID: ${testPoolId}`);
        }
        catch (e) {
            console.error("Failed to initialize Cognito adapter for integration tests. Skipping.", e);
            // Force skip if initialization fails
            throw new Error("Cognito adapter init failed. Ensure test env vars (REGION, POOL_ID, Credentials) are set.");
        }
    });
    afterEach(() => __awaiter(void 0, void 0, void 0, function* () {
        // --- Cleanup ---
        console.log('Cleaning up Cognito resources...');
        // Remove users from groups first
        for (const groupName of createdGroupNames) {
            for (const username of createdUsernames) {
                try {
                    // Need a way to list users in group or just try removing known ones
                    yield adapter.adminRemoveUserFromGroup(username, groupName);
                }
                catch (e) {
                    if (!(e instanceof UserManagementError_1.UserNotFoundError || e instanceof UserManagementError_1.GroupNotFoundError || (e === null || e === void 0 ? void 0 : e.name) === 'UserNotFoundException' || (e === null || e === void 0 ? void 0 : e.name) === 'ResourceNotFoundException')) {
                        console.warn(`Warn: Error removing user ${username} from group ${groupName} during cleanup:`, e.message);
                    }
                }
            }
        }
        // Delete users
        for (const username of createdUsernames) {
            try {
                yield adapter.adminDeleteUser(username);
                console.log(`Cleaned up user: ${username}`);
            }
            catch (e) {
                if (!(e instanceof UserManagementError_1.UserNotFoundError || (e === null || e === void 0 ? void 0 : e.name) === 'UserNotFoundException')) { // Ignore if already deleted
                    console.warn(`Warn: Error deleting user ${username} during cleanup:`, e.message);
                }
            }
        }
        // Delete groups
        for (const groupName of createdGroupNames) {
            try {
                yield adapter.adminDeleteGroup(groupName);
                console.log(`Cleaned up group: ${groupName}`);
            }
            catch (e) {
                if (!(e instanceof UserManagementError_1.GroupNotFoundError || (e === null || e === void 0 ? void 0 : e.name) === 'ResourceNotFoundException')) { // Ignore if already deleted
                    console.warn(`Warn: Error deleting group ${groupName} during cleanup:`, e.message);
                }
            }
        }
        createdUsernames = [];
        createdGroupNames = [];
    }));
    // --- Test Cases ---
    it('should adminCreateUser successfully', () => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b;
        const username = `testuser-${Date.now()}`;
        const email = `${username}@integrationtest.local`;
        const details = {
            username: username,
            userAttributes: { email: email, name: 'Integration Test' },
            temporaryPassword: 'TempPassword123!', // Provide a compliant password
        };
        const result = yield adapter.adminCreateUser(details);
        createdUsernames.push(username); // Add for cleanup
        expect(result).toBeDefined();
        expect(result.Username).toBe(username);
        expect(result.UserStatus).toBe('FORCE_CHANGE_PASSWORD');
        expect((_b = (_a = result.Attributes) === null || _a === void 0 ? void 0 : _a.find(a => a.Name === 'email')) === null || _b === void 0 ? void 0 : _b.Value).toBe(email);
        // Verify user exists using adminGetUser
        const foundUser = yield adapter.adminGetUser(username);
        expect(foundUser).not.toBeNull();
        expect(foundUser === null || foundUser === void 0 ? void 0 : foundUser.Username).toBe(username);
    }));
    it('should throw ValidationError (mapped from UsernameExists) when creating duplicate user', () => __awaiter(void 0, void 0, void 0, function* () {
        const username = `testuser-dup-${Date.now()}`;
        const email = `${username}@integrationtest.local`;
        const details = { username, userAttributes: { email }, temporaryPassword: 'TempPassword123!' };
        yield adapter.adminCreateUser(details); // Create first time
        createdUsernames.push(username);
        // Attempt to create again
        yield expect(adapter.adminCreateUser(details)).rejects.toThrow(BaseError_1.ValidationError); // Or UsernameExistsException if not mapped
    }));
    it('should adminGetUser for an existing user', () => __awaiter(void 0, void 0, void 0, function* () {
        // Create a user first (reuse logic from create test)
        const username = `testuser-get-${Date.now()}`;
        yield adapter.adminCreateUser({ username, userAttributes: { email: `${username}@i.test` }, temporaryPassword: 'TempPassword123!' });
        createdUsernames.push(username);
        const user = yield adapter.adminGetUser(username);
        expect(user).not.toBeNull();
        expect(user === null || user === void 0 ? void 0 : user.Username).toBe(username);
    }));
    it('should adminGetUser return null for a non-existent user', () => __awaiter(void 0, void 0, void 0, function* () {
        const user = yield adapter.adminGetUser(`nonexistent-${Date.now()}`);
        expect(user).toBeNull();
    }));
    it('should adminCreateGroup and adminDeleteGroup', () => __awaiter(void 0, void 0, void 0, function* () {
        const groupName = `testgroup-${Date.now()}`;
        // Create
        const createResult = yield adapter.adminCreateGroup({ groupName, description: 'Integration test group' });
        createdGroupNames.push(groupName);
        expect(createResult).toBeDefined();
        expect(createResult.GroupName).toBe(groupName);
        // Verify with Get
        const getResult = yield adapter.adminGetGroup(groupName);
        expect(getResult).not.toBeNull();
        expect(getResult === null || getResult === void 0 ? void 0 : getResult.GroupName).toBe(groupName);
        // Delete
        yield expect(adapter.adminDeleteGroup(groupName)).resolves.toBeUndefined();
        // Verify deletion
        yield expect(adapter.adminGetGroup(groupName)).resolves.toBeNull();
        createdGroupNames = createdGroupNames.filter(g => g !== groupName); // Remove from cleanup list
    }));
    it('should throw GroupExistsError (mapped) when creating duplicate group', () => __awaiter(void 0, void 0, void 0, function* () {
        const groupName = `testgroup-dup-${Date.now()}`;
        yield adapter.adminCreateGroup({ groupName });
        createdGroupNames.push(groupName);
        yield expect(adapter.adminCreateGroup({ groupName })).rejects.toThrow(UserManagementError_1.GroupExistsError);
    }));
    it('should adminAddUserToGroup and adminRemoveUserFromGroup', () => __awaiter(void 0, void 0, void 0, function* () {
        const username = `testuser-grp-${Date.now()}`;
        const groupName = `testgroup-assign-${Date.now()}`;
        // Create user and group
        yield adapter.adminCreateUser({ username, userAttributes: { email: `${username}@i.test` }, temporaryPassword: 'TempPassword123!' });
        createdUsernames.push(username);
        yield adapter.adminCreateGroup({ groupName });
        createdGroupNames.push(groupName);
        // Add user to group
        yield expect(adapter.adminAddUserToGroup(username, groupName)).resolves.toBeUndefined();
        // Verify using list groups for user
        const userGroups = yield adapter.adminListGroupsForUser(username);
        expect(userGroups.groups.some(g => g.GroupName === groupName)).toBe(true);
        // Remove user from group
        yield expect(adapter.adminRemoveUserFromGroup(username, groupName)).resolves.toBeUndefined();
        // Verify removal
        const userGroupsAfter = yield adapter.adminListGroupsForUser(username);
        expect(userGroupsAfter.groups.some(g => g.GroupName === groupName)).toBe(false);
    }));
    // Add more tests for:
    // - updateUserAttributes
    // - disable/enable user
    // - password reset/set
    // - listUsers, listUsersInGroup, listGroups
    // - error handling for invalid parameters, not found etc. for various operations
});
