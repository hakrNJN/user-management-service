// tests/integration/CognitoUserMgmtAdapter.integration.spec.ts
import 'reflect-metadata';
import { IConfigService } from '../../src/application/interfaces/IConfigService';
import { AdminCreateUserDetails, IUserMgmtAdapter } from '../../src/application/interfaces/IUserMgmtAdapter';
import { container } from '../../src/container';
import { GroupExistsError, GroupNotFoundError, UserNotFoundError } from '../../src/domain/exceptions/UserManagementError'; // Assuming mapped errors
import { TYPES } from '../../src/shared/constants/types';
import { ValidationError } from '../../src/shared/errors/BaseError';

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
    let adapter: IUserMgmtAdapter;
    let configService: IConfigService;
    let createdUsernames: string[] = []; // Keep track of created users for cleanup
    let createdGroupNames: string[] = []; // Keep track of created groups for cleanup

    // Increase timeout for AWS interactions
    jest.setTimeout(30000); // 30 seconds

    beforeAll(() => {
        // Resolve the adapter instance - assumes container is configured with REAL credentials for test pool
        // Ensure COGNITO_USER_POOL_ID points to the TEST pool in the test env
        try {
            adapter = container.resolve<IUserMgmtAdapter>(TYPES.UserMgmtAdapter);
            configService = container.resolve<IConfigService>(TYPES.ConfigService);
            const testPoolId = configService.getOrThrow('COGNITO_USER_POOL_ID');
            // Basic check to ensure adapter seems configured
            if (!testPoolId || testPoolId.toLowerCase().includes('prod')) { // Example check if prop accessible
                throw new Error("Cognito adapter test running without TEST user pool ID configured. ABORTING.");
            }
            console.warn(`Running Cognito integration tests against User Pool ID: ${testPoolId}`);
        } catch (e) {
            console.error("Failed to initialize Cognito adapter for integration tests. Skipping.", e);
            // Force skip if initialization fails
            throw new Error("Cognito adapter init failed. Ensure test env vars (REGION, POOL_ID, Credentials) are set.");
        }
    });

    afterEach(async () => {
        // --- Cleanup ---
        console.log('Cleaning up Cognito resources...');
        // Remove users from groups first
        for (const groupName of createdGroupNames) {
            for (const username of createdUsernames) {
                try {
                    // Need a way to list users in group or just try removing known ones
                    await adapter.adminRemoveUserFromGroup(username, groupName);
                } catch (e: any) {
                    if (!(e instanceof UserNotFoundError || e instanceof GroupNotFoundError || e?.name === 'UserNotFoundException' || e?.name === 'ResourceNotFoundException')) {
                        console.warn(`Warn: Error removing user ${username} from group ${groupName} during cleanup:`, e.message);
                    }
                }
            }
        }
        // Delete users
        for (const username of createdUsernames) {
            try {
                await adapter.adminDeleteUser(username);
                console.log(`Cleaned up user: ${username}`);
            } catch (e: any) {
                if (!(e instanceof UserNotFoundError || e?.name === 'UserNotFoundException')) { // Ignore if already deleted
                    console.warn(`Warn: Error deleting user ${username} during cleanup:`, e.message);
                }
            }
        }
        // Delete groups
        for (const groupName of createdGroupNames) {
            try {
                await adapter.adminDeleteGroup(groupName);
                console.log(`Cleaned up group: ${groupName}`);
            } catch (e: any) {
                if (!(e instanceof GroupNotFoundError || e?.name === 'ResourceNotFoundException')) { // Ignore if already deleted
                    console.warn(`Warn: Error deleting group ${groupName} during cleanup:`, e.message);
                }
            }
        }
        createdUsernames = [];
        createdGroupNames = [];
    });

    // --- Test Cases ---

    it('should adminCreateUser successfully', async () => {
        const username = `testuser-${Date.now()}`;
        const email = `${username}@integrationtest.local`;
        const details: AdminCreateUserDetails = {
            username: username,
            userAttributes: { email: email, name: 'Integration Test' },
            temporaryPassword: 'TempPassword123!', // Provide a compliant password
        };

        const result = await adapter.adminCreateUser(details);
        createdUsernames.push(username); // Add for cleanup

        expect(result).toBeDefined();
        expect(result.Username).toBe(username);
        expect(result.UserStatus).toBe('FORCE_CHANGE_PASSWORD');
        expect(result.Attributes?.find(a => a.Name === 'email')?.Value).toBe(email);

        // Verify user exists using adminGetUser
        const foundUser = await adapter.adminGetUser(username);
        expect(foundUser).not.toBeNull();
        expect(foundUser?.Username).toBe(username);
    });

    it('should throw ValidationError (mapped from UsernameExists) when creating duplicate user', async () => {
        const username = `testuser-dup-${Date.now()}`;
        const email = `${username}@integrationtest.local`;
        const details: AdminCreateUserDetails = { username, userAttributes: { email }, temporaryPassword: 'TempPassword123!' };

        await adapter.adminCreateUser(details); // Create first time
        createdUsernames.push(username);

        // Attempt to create again
        await expect(adapter.adminCreateUser(details)).rejects.toThrow(ValidationError); // Or UsernameExistsException if not mapped
    });

    it('should adminGetUser for an existing user', async () => {
        // Create a user first (reuse logic from create test)
        const username = `testuser-get-${Date.now()}`;
        await adapter.adminCreateUser({ username, userAttributes: { email: `${username}@i.test` }, temporaryPassword: 'TempPassword123!' });
        createdUsernames.push(username);

        const user = await adapter.adminGetUser(username);
        expect(user).not.toBeNull();
        expect(user?.Username).toBe(username);
    });

    it('should adminGetUser return null for a non-existent user', async () => {
        const user = await adapter.adminGetUser(`nonexistent-${Date.now()}`);
        expect(user).toBeNull();
    });

    it('should adminCreateGroup and adminDeleteGroup', async () => {
        const groupName = `testgroup-${Date.now()}`;

        // Create
        const createResult = await adapter.adminCreateGroup({ groupName, description: 'Integration test group' });
        createdGroupNames.push(groupName);
        expect(createResult).toBeDefined();
        expect(createResult.GroupName).toBe(groupName);

        // Verify with Get
        const getResult = await adapter.adminGetGroup(groupName);
        expect(getResult).not.toBeNull();
        expect(getResult?.GroupName).toBe(groupName);

        // Delete
        await expect(adapter.adminDeleteGroup(groupName)).resolves.toBeUndefined();

        // Verify deletion
        await expect(adapter.adminGetGroup(groupName)).resolves.toBeNull();
        createdGroupNames = createdGroupNames.filter(g => g !== groupName); // Remove from cleanup list
    });

    it('should throw GroupExistsError (mapped) when creating duplicate group', async () => {
        const groupName = `testgroup-dup-${Date.now()}`;
        await adapter.adminCreateGroup({ groupName });
        createdGroupNames.push(groupName);

        await expect(adapter.adminCreateGroup({ groupName })).rejects.toThrow(GroupExistsError);
    });

    it('should adminAddUserToGroup and adminRemoveUserFromGroup', async () => {
        const username = `testuser-grp-${Date.now()}`;
        const groupName = `testgroup-assign-${Date.now()}`;

        // Create user and group
        await adapter.adminCreateUser({ username, userAttributes: { email: `${username}@i.test` }, temporaryPassword: 'TempPassword123!' });
        createdUsernames.push(username);
        await adapter.adminCreateGroup({ groupName });
        createdGroupNames.push(groupName);

        // Add user to group
        await expect(adapter.adminAddUserToGroup(username, groupName)).resolves.toBeUndefined();

        // Verify using list groups for user
        const userGroups = await adapter.adminListGroupsForUser(username);
        expect(userGroups.groups.some(g => g.GroupName === groupName)).toBe(true);

        // Remove user from group
        await expect(adapter.adminRemoveUserFromGroup(username, groupName)).resolves.toBeUndefined();

        // Verify removal
        const userGroupsAfter = await adapter.adminListGroupsForUser(username);
        expect(userGroupsAfter.groups.some(g => g.GroupName === groupName)).toBe(false);
    });

    // Add more tests for:
    // - updateUserAttributes
    // - disable/enable user
    // - password reset/set
    // - listUsers, listUsersInGroup, listGroups
    // - error handling for invalid parameters, not found etc. for various operations
});