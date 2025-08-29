import { inject, injectable } from 'tsyringe';
import { AdminUserView } from '../../domain/entities/AdminUserView';
import { Group } from '../../domain/entities/Group';
import { UserAlreadyInGroupError } from '../../domain/exceptions/UserManagementError';
import { TYPES } from '../../shared/constants/types';
import { BaseError, NotFoundError, ValidationError } from '../../shared/errors/BaseError';
import { AdminUser } from '../../shared/types/admin-user.interface';
import { ILogger } from '../interfaces/ILogger';
import { IUserAdminService } from '../interfaces/IUserAdminService';
import { AdminCreateUserDetails, AdminUpdateUserAttributesDetails, IUserMgmtAdapter, ListUsersOptions } from '../interfaces/IUserMgmtAdapter';

/**
 * UserAdminService handles administrative operations related to users.
 * It interacts with the IUserMgmtAdapter to perform actions on user accounts.
 */
@injectable()
export class UserAdminService implements IUserAdminService {
    constructor(
        @inject(TYPES.UserMgmtAdapter) private userMgmtAdapter: IUserMgmtAdapter,
        @inject(TYPES.Logger) private logger: ILogger
    ) {}

    // Helper to check admin privileges (example)
    private checkAdminPermission(adminUser: AdminUser, requiredPermission: string): void {
        // For beta, a simple check: if adminUser has 'admin' role, they have all permissions.
        // In a production system, this would involve a more sophisticated permission mapping
        // (e.g., roles -> permissions lookup, or direct permission assignment).
        if (!adminUser.roles?.includes('admin')) {
            this.logger.warn(`Admin permission check failed: User ${adminUser.username} does not have 'admin' role. Required permission: ${requiredPermission}`, { adminUserId: adminUser.id, requiredPermission });
            throw new BaseError('ForbiddenError', 403, `Admin privileges required for this operation: ${requiredPermission}.`, true);
        }
        this.logger.debug(`Admin permission check passed for ${requiredPermission}`, { adminUserId: adminUser.id, requiredPermission });
    }

    private logAuditEvent(adminUser: AdminUser, action: string, targetType: string, targetId: string, status: 'SUCCESS' | 'FAILURE', details?: object) {
        const logObject = {
            audit: true,
            adminUserId: adminUser.id,
            adminUsername: adminUser.username,
            action,
            target: {
                type: targetType,
                id: targetId,
            },
            status,
            timestamp: new Date().toISOString(),
            ...details,
        };
        if (status === 'SUCCESS') {
            this.logger.info(`[AUDIT] ${action} on ${targetType} ${targetId}`, logObject);
        } else {
            this.logger.error(`[AUDIT] FAILED ${action} on ${targetType} ${targetId}`, logObject);
        }
    }

    /**
     * Creates a new user.
     * @param adminUser - The admin user performing the operation.
     * @param details - The details of the user to create.
     * @returns A promise that resolves to the created AdminUserView.
     * @throws {Error} If an error occurs during user creation.
     */
    async createUser(adminUser: AdminUser, details: AdminCreateUserDetails): Promise<AdminUserView> {
        this.checkAdminPermission(adminUser, 'user:create');
        try {
            const cognitoUser = await this.userMgmtAdapter.adminCreateUser(details);
            this.logAuditEvent(adminUser, 'CREATE_USER', 'USER', details.username, 'SUCCESS', { createdUser: cognitoUser });
            return AdminUserView.fromCognitoUser(cognitoUser);
        } catch (error: any) {
            this.logAuditEvent(adminUser, 'CREATE_USER', 'USER', details.username, 'FAILURE', { error: error.message });
            throw error;
        }
    }

    /**
     * Retrieves a user by their username.
     * @param adminUser - The admin user performing the operation.
     * @param username - The username of the user to retrieve.
     * @returns A promise that resolves to the AdminUserView if found, null otherwise.
     * @throws {Error} If an error occurs during user retrieval.
     */
    async getUser(adminUser: AdminUser, username: string): Promise<AdminUserView | null> {
        this.checkAdminPermission(adminUser, 'user:read');
        this.logger.info(`Admin attempting to get user`, { adminUserId: adminUser.id, targetUsername: username });
        try {
            const cognitoUser = await this.userMgmtAdapter.adminGetUser(username);
            if (!cognitoUser) {
                this.logger.warn(`Admin get user: User not found`, { adminUserId: adminUser.id, targetUsername: username });
                return null;
            }
            // Optionally fetch groups for the user to enrich the view
            const groupsResult = await this.userMgmtAdapter.adminListGroupsForUser(username);
            const groupNames = groupsResult.groups.map(g => g.GroupName).filter((name): name is string => !!name);

            this.logger.info(`Admin successfully retrieved user`, { adminUserId: adminUser.id, targetUsername: username });
            return AdminUserView.fromCognitoUser(cognitoUser, groupNames);
        } catch (error: any) {
            this.logger.error(`Admin failed to get user ${username}`, { adminUserId: adminUser.id, error });
            // Don't re-throw NotFoundError from adapter, return null as per interface
            if (error instanceof NotFoundError) return null;
            throw error; // Re-throw other mapped errors
        }
    }

    /**
     * Lists users based on the provided options.
     * @param adminUser - The admin user performing the operation.
     * @param options - The options for listing users.
     * @returns A promise that resolves to an object containing an array of AdminUserView and an optional pagination token.
     * @throws {Error} If an error occurs during user listing.
     */
    async listUsers(adminUser: AdminUser, options: ListUsersOptions): Promise<{ users: AdminUserView[], nextToken?: string }> {
        this.checkAdminPermission(adminUser, 'user:list');
        this.logger.info(`Admin attempting to list users`, { adminUserId: adminUser.id, options });

        // Default to listing only active users unless specified otherwise
        const listOptions = { ...options };
        if (listOptions.status === undefined) {
            listOptions.status = 'CONFIRMED'; // CONFIRMED users are generally the active ones
        }
        // Allow fetching all users by passing status: null or an empty string
        if (listOptions.status === null || listOptions.status === '') {
            delete listOptions.status;
        }

        try {
            const result = await this.userMgmtAdapter.adminListUsers(listOptions);
            const userViews = await Promise.all(result.users.map(async u => {
                const groupsResult = await this.userMgmtAdapter.adminListGroupsForUser(u.Username!);
                const groupNames = groupsResult.groups.map(g => g.GroupName).filter((name): name is string => !!name);
                return AdminUserView.fromCognitoUser(u, groupNames);
            }));

            this.logger.info(`Admin successfully listed ${userViews.length} users`, { adminUserId: adminUser.id });
            return { users: userViews, nextToken: result.paginationToken };
        } catch (error: any) {
             this.logger.error(`Admin failed to list users`, { adminUserId: adminUser.id, error });
             throw error; // Re-throw adapter errors
        }
    }

    /**
     * Updates the attributes of a user.
     * @param adminUser - The admin user performing the operation.
     * @param details - The details of the user attributes to update.
     * @returns A promise that resolves when the user attributes have been updated.
     * @throws {Error} If an error occurs during attribute update.
     */
    async updateUserAttributes(adminUser: AdminUser, details: AdminUpdateUserAttributesDetails): Promise<void> {
         this.checkAdminPermission(adminUser, 'user:update');
         this.logger.info(`Admin attempting to update attributes for user ${details.username}`, { adminUserId: adminUser.id, attributes: Object.keys(details.attributesToUpdate) });
         try {
            // Add validation: prevent updating critical attributes like 'sub'?
            await this.userMgmtAdapter.adminUpdateUserAttributes(details);
            this.logger.info(`Admin successfully updated attributes for user ${details.username}`, { adminUserId: adminUser.id });
        } catch (error: any) {
             this.logger.error(`Admin failed to update attributes for user ${details.username}`, { adminUserId: adminUser.id, error });
             throw error; // Re-throw adapter errors
        }
    }

    async deleteUser(adminUser: AdminUser, username: string): Promise<void> {
        this.checkAdminPermission(adminUser, 'user:delete');
        if (adminUser.username === username) {
            throw new ValidationError('Cannot delete your own admin account.');
        }
        try {
            await this.userMgmtAdapter.adminDeleteUser(username);
            this.logAuditEvent(adminUser, 'DELETE_USER', 'USER', username, 'SUCCESS');
        } catch (error: any) {
            this.logAuditEvent(adminUser, 'DELETE_USER', 'USER', username, 'FAILURE', { error: error.message });
            throw error;
        }
    }

    /**
     * Deletes a user.
     * @param adminUser - The admin user performing the operation.
     * @param username - The username of the user to delete.
     * @returns A promise that resolves when the user has been deleted.
     * @throws {Error} If an error occurs during user deletion.
     */
    async disableUser(adminUser: AdminUser, username: string): Promise<void> {
        this.checkAdminPermission(adminUser, 'user:disable');
        if (adminUser.username === username) {
            throw new ValidationError('Cannot deactivate your own admin account.');
        }
        try {
            await this.userMgmtAdapter.adminDisableUser(username);
            this.logAuditEvent(adminUser, 'DEACTIVATE_USER', 'USER', username, 'SUCCESS');
        } catch (error: any) {
            this.logAuditEvent(adminUser, 'DEACTIVATE_USER', 'USER', username, 'FAILURE', { error: error.message });
            throw error;
        }
    }

    async enableUser(adminUser: AdminUser, username: string): Promise<void> {
        this.checkAdminPermission(adminUser, 'user:enable');
        try {
            await this.userMgmtAdapter.adminEnableUser(username);
            this.logAuditEvent(adminUser, 'REACTIVATE_USER', 'USER', username, 'SUCCESS');
        } catch (error: any) {
            this.logAuditEvent(adminUser, 'REACTIVATE_USER', 'USER', username, 'FAILURE', { error: error.message });
            throw error;
        }
    }

    /**
     * Initiates a password reset for a user.
     * @param adminUser - The admin user performing the operation.
     * @param username - The username of the user for whom to initiate the password reset.
     * @returns A promise that resolves when the password reset has been initiated.
     * @throws {Error} If an error occurs during password reset initiation.
     */
    async initiatePasswordReset(adminUser: AdminUser, username: string): Promise<void> {
         this.checkAdminPermission(adminUser, 'user:password:reset');
         this.logger.info(`Admin attempting to initiate password reset for user`, { adminUserId: adminUser.id, targetUsername: username });
         try {
            await this.userMgmtAdapter.adminInitiatePasswordReset(username);
            this.logger.info(`Admin successfully initiated password reset for user`, { adminUserId: adminUser.id, targetUsername: username });
        } catch (error: any) {
             this.logger.error(`Admin failed to initiate password reset for user ${username}`, { adminUserId: adminUser.id, error });
             throw error;
        }
    }

    /**
     * Sets a new password for a user.
     * @param adminUser - The admin user performing the operation.
     * @param username - The username of the user for whom to set the password.
     * @param password - The new password to set.
     * @param permanent - Whether the password should be permanent.
     * @returns A promise that resolves when the password has been set.
     */
    async setUserPassword(adminUser: AdminUser, username: string, password: string, permanent: boolean): Promise<void> {
         this.checkAdminPermission(adminUser, 'user:password:set');
         try {
            await this.userMgmtAdapter.adminSetUserPassword(username, password, permanent);
            this.logAuditEvent(adminUser, 'SET_USER_PASSWORD', 'USER', username, 'SUCCESS');
        } catch (error: any) {
            this.logAuditEvent(adminUser, 'SET_USER_PASSWORD', 'USER', username, 'FAILURE', { error: error.message });
            throw error;
        }
    }

    /**
     * Adds a user to a group.
     * @param adminUser - The admin user performing the operation.
     * @param username - The username of the user to add to the group.
     * @param groupName - The name of the group to add the user to.
     * @returns A promise that resolves when the user has been added to the group.
     * @throws {Error} If an error occurs during adding the user to the group.
     */
    async addUserToGroup(adminUser: AdminUser, username: string, groupName: string): Promise<void> {
         this.checkAdminPermission(adminUser, 'user:group:add');
         this.logger.info(`Admin attempting to add user ${username} to group ${groupName}`, { adminUserId: adminUser.id });
         try {
             // Optional: Check if user already in group first? Adapter might throw error anyway.
            await this.userMgmtAdapter.adminAddUserToGroup(username, groupName);
            this.logger.info(`Admin successfully added user ${username} to group ${groupName}.`);
        } catch (error: any) {
             // Example: Catch specific error if adapter doesn't map it
             if (error instanceof Error && error.message?.includes('User is already in group')) { // Check based on actual Cognito error message
                 throw new UserAlreadyInGroupError(username, groupName);
             }
             this.logger.error(`Admin failed to add user ${username} to group ${groupName}`, { adminUserId: adminUser.id, error });
             throw error;
        }
    }

    /**
     * Removes a user from a group.
     * @param adminUser - The admin user performing the operation.
     * @param username - The username of the user to remove from the group.
     * @param groupName - The name of the group to remove the user from.
     * @returns A promise that resolves when the user has been removed from the group.
     * @throws {Error} If an error occurs during removing the user from the group.
     */
    async removeUserFromGroup(adminUser: AdminUser, username: string, groupName: string): Promise<void> {
         this.checkAdminPermission(adminUser, 'user:group:remove');
         this.logger.info(`Admin attempting to remove user ${username} from group ${groupName}`, { adminUserId: adminUser.id });
         try {
            await this.userMgmtAdapter.adminRemoveUserFromGroup(username, groupName);
            this.logger.info(`Admin successfully removed user ${username} from group ${groupName}.`);
        } catch (error: any) {
             this.logger.error(`Admin failed to remove user ${username} from group ${groupName}`, { adminUserId: adminUser.id, error });
             throw error;
        }
    }

    /**
     * Lists the groups a user belongs to.
     * @param adminUser - The admin user performing the operation.
     * @param username - The username of the user for whom to list groups.
     * @param limit - The maximum number of groups to return.
     * @param nextToken - A token for pagination.
     * @returns A promise that resolves to an object containing an array of Groups and an optional nextToken.
     * @throws {Error} If an error occurs during listing the groups for the user.
     */
    async listGroupsForUser(adminUser: AdminUser, username: string, limit?: number, nextToken?: string): Promise<{ groups: Group[], nextToken?: string }> {
        this.checkAdminPermission(adminUser, 'user:group:list');
        this.logger.info(`Admin attempting to list groups for user`, { adminUserId: adminUser.id, targetUsername: username });
        try {
            const result = await this.userMgmtAdapter.adminListGroupsForUser(username, limit, nextToken);
            const domainGroups = result.groups.map(g => Group.fromCognitoGroup(g));
            this.logger.info(`Admin successfully listed ${domainGroups.length} groups for user ${username}`, { adminUserId: adminUser.id });
            return { groups: domainGroups, nextToken: result.nextToken };
        } catch (error: any) {
             this.logger.error(`Admin failed to list groups for user ${username}`, { adminUserId: adminUser.id, error });
             throw error;
        }
    }

    /**
     * Lists the users in a group.
     * @param adminUser - The admin user performing the operation.
     * @param groupName - The name of the group for which to list users.
     * @param limit - The maximum number of users to return.
     * @param nextToken - A token for pagination.
     * @returns A promise that resolves to an object containing an array of AdminUserView and an optional nextToken.
     * @throws {Error} If an error occurs during listing the users in the group.
     */
    async listUsersInGroup(adminUser: AdminUser, groupName: string, limit?: number, nextToken?: string): Promise<{ users: AdminUserView[], nextToken?: string }> {
        this.checkAdminPermission(adminUser, 'group:user:list');
        this.logger.info(`Admin attempting to list users in group`, { adminUserId: adminUser.id, groupName });
        try {
            const result = await this.userMgmtAdapter.adminListUsersInGroup(groupName, limit, nextToken);
            const userViews = result.users.map(u => AdminUserView.fromCognitoUser(u));
            // TODO: Consider fetching groups for each user if needed (can be slow)
            this.logger.info(`Admin successfully listed ${userViews.length} users in group ${groupName}`, { adminUserId: adminUser.id });
            return { users: userViews, nextToken: result.nextToken };
        } catch (error: any) {
             this.logger.error(`Admin failed to list users in group ${groupName}`, { adminUserId: adminUser.id, error });
             throw error;
        }
    }

    /**
     * Updates a user's group memberships, adding them to new groups and removing them from old ones.
     * @param adminUser - The authenticated admin performing the action.
     * @param username - The username of the user.
     * @param groupNames - An array of group names the user should belong to.
     * @returns A promise resolving upon successful update.
     * @throws {NotFoundError | BaseError} For failures.
     */
    async updateUserGroups(adminUser: AdminUser, username: string, groupNames: string[]): Promise<void> {
        this.checkAdminPermission(adminUser, 'user:group:update');
        this.logger.info(`Admin attempting to update groups for user ${username}`, { adminUserId: adminUser.id, targetUsername: username, newGroups: groupNames });

        try {
            const currentGroupsResult = await this.userMgmtAdapter.adminListGroupsForUser(username);
            const currentGroupNames = new Set(currentGroupsResult.groups.map(g => g.GroupName).filter((name): name is string => !!name));
            const newGroupNames = new Set(groupNames);

            const groupsToAdd = [...newGroupNames].filter(groupName => !currentGroupNames.has(groupName));
            const groupsToRemove = [...currentGroupNames].filter(groupName => !newGroupNames.has(groupName));

            // Batch promises for efficiency
            const addPromises = groupsToAdd.map(groupName => this.addUserToGroup(adminUser, username, groupName));
            const removePromises = groupsToRemove.map(groupName => this.removeUserFromGroup(adminUser, username, groupName));

            await Promise.all([...addPromises, ...removePromises]);

            this.logAuditEvent(adminUser, 'UPDATE_USER_GROUPS', 'USER', username, 'SUCCESS', { added: groupsToAdd, removed: groupsToRemove });
        } catch (error: any) {
            this.logAuditEvent(adminUser, 'UPDATE_USER_GROUPS', 'USER', username, 'FAILURE', { error: error.message });
            throw error;
        }
    }
}
