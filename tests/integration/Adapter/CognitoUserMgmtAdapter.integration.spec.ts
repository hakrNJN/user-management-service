// tests/integration/CognitoUserMgmtAdapter.integration.spec.ts
import 'reflect-metadata';
import { IConfigService } from '../../../src/application/interfaces/IConfigService';
import { AdminCreateUserDetails, IUserMgmtAdapter } from '../../../src/application/interfaces/IUserMgmtAdapter';
import { container } from '../../../src/container';
import { GroupExistsError, GroupNotFoundError, UserNotFoundError } from '../../../src/domain/exceptions/UserManagementError';
import { TYPES } from '../../../src/shared/constants/types';
import { ValidationError } from '../../../src/shared/errors/BaseError';

const RUN_COGNITO_INTEGRATION_TESTS = process.env.RUN_COGNITO_INTEGRATION_TESTS === 'true';
const cognitoDescribe = RUN_COGNITO_INTEGRATION_TESTS ? describe : describe.skip;

cognitoDescribe('CognitoUserMgmtAdapter Integration Tests', () => {
    let adapter: IUserMgmtAdapter;
    let configService: IConfigService;
    
    // Shared resources for tests
    const primaryUsername = `primary-user-${Date.now()}`;
    const primaryEmail = `${primaryUsername}@integrationtest.local`;
    const primaryGroupName = `primary-group-${Date.now()}`;

    // Keep track of all created resources for cleanup
    let createdUsernames: string[] = [primaryUsername];
    let createdGroupNames: string[] = [primaryGroupName];

    jest.setTimeout(60000); // Increase timeout to 60 seconds for all tests

    beforeAll(async () => {
        process.env.AUTHZ_TABLE_NAME = 'test-authz-table';
        try {
            adapter = container.resolve<IUserMgmtAdapter>(TYPES.UserMgmtAdapter);
            configService = container.resolve<IConfigService>(TYPES.ConfigService);
            const testPoolId = configService.getOrThrow('COGNITO_USER_POOL_ID');
            if (!testPoolId || testPoolId.toLowerCase().includes('prod')) {
                throw new Error("Cognito adapter test running without TEST user pool ID configured. ABORTING.");
            }
            console.warn(`Running Cognito integration tests against User Pool ID: ${testPoolId}`);

            // Create shared resources
            const userDetails: AdminCreateUserDetails = {
                username: primaryUsername,
                userAttributes: { email: primaryEmail, name: 'Primary Test User' },
                temporaryPassword: 'PrimaryPassword123!',
                suppressWelcomeMessage: true, // Suppress email to avoid rate limiting
            };
            await adapter.adminCreateUser(userDetails);
            // Manually verify the user's email to allow for password resets
            await adapter.adminUpdateUserAttributes({
                username: primaryUsername,
                attributesToUpdate: { email_verified: 'true' }
            });
            await adapter.adminCreateGroup({ groupName: primaryGroupName, description: 'Primary test group' });

        } catch (e) {
            console.error("Failed to initialize Cognito adapter or create shared resources. Skipping.", e);
            throw new Error("Cognito adapter init failed. Ensure test env vars are set and permissions are correct.");
        }
    });

    afterAll(async () => {
        console.log('Cleaning up all Cognito resources...');
        // Unassign all users from all groups first
        for (const groupName of createdGroupNames) {
            for (const username of createdUsernames) {
                try {
                    await adapter.adminRemoveUserFromGroup(username, groupName);
                } catch (e: any) {
                    if (!(e instanceof UserNotFoundError || e instanceof GroupNotFoundError || e?.name === 'UserNotFoundException' || e?.name === 'ResourceNotFoundException')) {
                        console.warn(`Warn: Error removing user ${username} from group ${groupName} during cleanup:`, e.message);
                    }
                }
            }
        }
        // Delete all users
        for (const username of createdUsernames) {
            try {
                await adapter.adminDeleteUser(username);
                console.log(`Cleaned up user: ${username}`);
            } catch (e: any) {
                if (!(e instanceof UserNotFoundError || e?.name === 'UserNotFoundException')) {
                    console.warn(`Warn: Error deleting user ${username} during cleanup:`, e.message);
                }
            }
        }
        // Delete all groups
        for (const groupName of createdGroupNames) {
            try {
                // Assuming adminDeleteGroup is a soft delete (deactivate)
                await adapter.adminDeleteGroup(groupName);
                console.log(`Cleaned up group: ${groupName}`);
            } catch (e: any) {
                if (!(e instanceof GroupNotFoundError || e?.name === 'ResourceNotFoundException')) {
                    console.warn(`Warn: Error deleting group ${groupName} during cleanup:`, e.message);
                }
            }
        }
    });

    // --- Test Cases ---

    it('should get the primary user successfully', async () => {
        const foundUser = await adapter.adminGetUser(primaryUsername);
        expect(foundUser).not.toBeNull();
        expect(foundUser?.Username).toBe(primaryUsername);
    });

    it('should throw ValidationError when creating a duplicate user', async () => {
        const details: AdminCreateUserDetails = {
            username: primaryUsername, // Use the already created primary username
            userAttributes: { email: primaryEmail },
            temporaryPassword: 'TempPassword123!',
            suppressWelcomeMessage: true,
        };
        await expect(adapter.adminCreateUser(details)).rejects.toThrow(ValidationError);
    });

    it('should return null when getting a non-existent user', async () => {
        const user = await adapter.adminGetUser(`nonexistent-${Date.now()}`);
        expect(user).toBeNull();
    });

    it('should get the primary group successfully', async () => {
        const getResult = await adapter.adminGetGroup(primaryGroupName);
        expect(getResult).not.toBeNull();
        expect(getResult?.GroupName).toBe(primaryGroupName);
    });

    it('should throw GroupExistsError when creating a duplicate group', async () => {
        await expect(adapter.adminCreateGroup({ groupName: primaryGroupName })).rejects.toThrow(GroupExistsError);
    });

    it('should add and remove user from group', async () => {
        // Add user to group
        await expect(adapter.adminAddUserToGroup(primaryUsername, primaryGroupName)).resolves.toBeUndefined();
        let userGroups = await adapter.adminListGroupsForUser(primaryUsername);
        expect(userGroups.groups.some(g => g.GroupName === primaryGroupName)).toBe(true);

        // Remove user from group
        await expect(adapter.adminRemoveUserFromGroup(primaryUsername, primaryGroupName)).resolves.toBeUndefined();
        userGroups = await adapter.adminListGroupsForUser(primaryUsername);
        expect(userGroups.groups.some(g => g.GroupName === primaryGroupName)).toBe(false);
    });

    it('should update user attributes successfully', async () => {
        const updates = {
            username: primaryUsername,
            attributesToUpdate: { name: 'Primary User Updated Name' }
        };
        await expect(adapter.adminUpdateUserAttributes(updates)).resolves.toBeUndefined();
        const foundUser = await adapter.adminGetUser(primaryUsername);
        expect(foundUser?.Attributes?.find(a => a.Name === 'name')?.Value).toBe('Primary User Updated Name');
    });

    it('should disable and enable a user', async () => {
        // Disable user
        await expect(adapter.adminDisableUser(primaryUsername)).resolves.toBeUndefined();
        const disabledUser = await adapter.adminGetUser(primaryUsername);
        expect(disabledUser?.Enabled).toBe(false);

        // Enable user
        await expect(adapter.adminEnableUser(primaryUsername)).resolves.toBeUndefined();
        const enabledUser = await adapter.adminGetUser(primaryUsername);
        expect(enabledUser?.Enabled).toBe(true);
    });

    it('should set a user password', async () => {
        // Set a new password
        await expect(adapter.adminSetUserPassword(primaryUsername, 'NewPassword123!', true)).resolves.toBeUndefined();
    });

    it('should list users, groups, and users in a group', async () => {
        // List users
        const usersResult = await adapter.adminListUsers({});
        expect(usersResult.users.some(u => u.Username === primaryUsername)).toBe(true);

        // List groups
        const groupsResult = await adapter.adminListGroups();
        expect(groupsResult.groups.some(g => g.GroupName === primaryGroupName)).toBe(true);

        // List users in group
        await adapter.adminAddUserToGroup(primaryUsername, primaryGroupName);
        const usersInGroupResult = await adapter.adminListUsersInGroup(primaryGroupName);
        expect(usersInGroupResult.users.some(u => u.Username === primaryUsername)).toBe(true);
        // Cleanup for this test
        await adapter.adminRemoveUserFromGroup(primaryUsername, primaryGroupName);
    });
    
    // Note: Soft delete is tested implicitly by the afterAll cleanup
});
