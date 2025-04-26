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
    private checkAdminPermission(adminUser: AdminUser, requiredRole = 'admin'): void {
        // Implement actual permission check based on adminUser.roles
        if (!adminUser.roles?.includes(requiredRole)) {
            this.logger.warn(`Admin permission check failed`, { adminUserId: adminUser.id, requiredRole });
            throw new BaseError('ForbiddenError', 403, 'Admin privileges required for this operation.', true);
        }
        this.logger.debug(`Admin permission check passed`, { adminUserId: adminUser.id, requiredRole });
    }

    /**
     * Creates a new user.
     * @param adminUser - The admin user performing the operation.
     * @param details - The details of the user to create.
     * @returns A promise that resolves to the created AdminUserView.
     * @throws {Error} If an error occurs during user creation.
     */
    async createUser(adminUser: AdminUser, details: AdminCreateUserDetails): Promise<AdminUserView> {
        this.checkAdminPermission(adminUser); // Ensure admin has rights
        this.logger.info(`Admin attempting to create user`, { adminUserId: adminUser.id, newUsername: details.username });
        try {
            // Add default attributes if needed (e.g., custom:createdBy)
            // details.userAttributes['custom:createdBy'] = adminUser.id;
            const cognitoUser = await this.userMgmtAdapter.adminCreateUser(details);
            this.logger.info(`Admin successfully created user`, { adminUserId: adminUser.id, newUsername: details.username });
            // Map Cognito UserType to our AdminUserView domain entity
            return AdminUserView.fromCognitoUser(cognitoUser);
        } catch (error: any) {
            this.logger.error(`Admin failed to create user ${details.username}`, { adminUserId: adminUser.id, error });
            throw error; // Re-throw adapter errors (already mapped)
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
        this.checkAdminPermission(adminUser);
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
    async listUsers(adminUser: AdminUser, options: ListUsersOptions): Promise<{ users: AdminUserView[], paginationToken?: string }> {
        this.checkAdminPermission(adminUser);
        this.logger.info(`Admin attempting to list users`, { adminUserId: adminUser.id, options });
        try {
            const result = await this.userMgmtAdapter.adminListUsers(options);
            const userViews = result.users.map(u => AdminUserView.fromCognitoUser(u));
            // TODO: Consider fetching groups for each user if needed (can be slow for large lists)
            this.logger.info(`Admin successfully listed ${userViews.length} users`, { adminUserId: adminUser.id });
            return { users: userViews, paginationToken: result.paginationToken };
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
         this.checkAdminPermission(adminUser);
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

    /**
     * Deletes a user.
     * @param adminUser - The admin user performing the operation.
     * @param username - The username of the user to delete.
     * @returns A promise that resolves when the user has been deleted.
     * @throws {Error} If an error occurs during user deletion.
     */
    async deleteUser(adminUser: AdminUser, username: string): Promise<void> {
         this.checkAdminPermission(adminUser);
         this.logger.info(`Admin attempting to delete user`, { adminUserId: adminUser.id, targetUsername: username });
         try {
             // Add safety check? Prevent deleting self? Prevent deleting other admins?
             if (adminUser.username === username) {
                 throw new ValidationError('Cannot delete your own admin account.');
             }
            await this.userMgmtAdapter.adminDeleteUser(username);
            this.logger.info(`Admin successfully deleted user`, { adminUserId: adminUser.id, targetUsername: username });
        } catch (error: any) {
             this.logger.error(`Admin failed to delete user ${username}`, { adminUserId: adminUser.id, error });
             throw error; // Re-throw adapter errors
        }
    }

    /**
     * Disables a user.
     * @param adminUser - The admin user performing the operation.
     * @param username - The username of the user to disable.
     * @returns A promise that resolves when the user has been disabled.
     * @throws {Error} If an error occurs during user disabling.
     */
    async disableUser(adminUser: AdminUser, username: string): Promise<void> {
         this.checkAdminPermission(adminUser);
         this.logger.info(`Admin attempting to disable user`, { adminUserId: adminUser.id, targetUsername: username });
         try {
             if (adminUser.username === username) {
                 throw new ValidationError('Cannot disable your own admin account.');
             }
            await this.userMgmtAdapter.adminDisableUser(username);
            this.logger.info(`Admin successfully disabled user`, { adminUserId: adminUser.id, targetUsername: username });
        } catch (error: any) {
             this.logger.error(`Admin failed to disable user ${username}`, { adminUserId: adminUser.id, error });
             throw error;
        }
    }

    /**
     * Enables a user.
     * @param adminUser - The admin user performing the operation.
     * @param username - The username of the user to enable.
     * @returns A promise that resolves when the user has been enabled.
     * @throws {Error} If an error occurs during user enabling.
     */
    async enableUser(adminUser: AdminUser, username: string): Promise<void> {
         this.checkAdminPermission(adminUser);
         this.logger.info(`Admin attempting to enable user`, { adminUserId: adminUser.id, targetUsername: username });
         try {
            await this.userMgmtAdapter.adminEnableUser(username);
            this.logger.info(`Admin successfully enabled user`, { adminUserId: adminUser.id, targetUsername: username });
        } catch (error: any) {
             this.logger.error(`Admin failed to enable user ${username}`, { adminUserId: adminUser.id, error });
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
         this.checkAdminPermission(adminUser);
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
         this.checkAdminPermission(adminUser);
         this.logger.info(`Admin attempting to set password for user`, { adminUserId: adminUser.id, targetUsername: username, permanent });
         try {
             // Add validation for password complexity if needed (beyond Cognito policy)
            await this.userMgmtAdapter.adminSetUserPassword(username, password, permanent);
            this.logger.info(`Admin successfully set password for user`, { adminUserId: adminUser.id, targetUsername: username });
        } catch (error: any) {
             this.logger.error(`Admin failed to set password for user ${username}`, { adminUserId: adminUser.id, error });
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
         this.checkAdminPermission(adminUser);
         this.logger.info(`Admin attempting to add user ${username} to group ${groupName}`, { adminUserId: adminUser.id });
         try {
             // Optional: Check if user already in group first? Adapter might throw error anyway.
            await this.userMgmtAdapter.adminAddUserToGroup(username, groupName);
            this.logger.info(`Admin successfully added user ${username} to group ${groupName}`, { adminUserId: adminUser.id });
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
         this.checkAdminPermission(adminUser);
         this.logger.info(`Admin attempting to remove user ${username} from group ${groupName}`, { adminUserId: adminUser.id });
         try {
            await this.userMgmtAdapter.adminRemoveUserFromGroup(username, groupName);
            this.logger.info(`Admin successfully removed user ${username} from group ${groupName}`, { adminUserId: adminUser.id });
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
        this.checkAdminPermission(adminUser);
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
        this.checkAdminPermission(adminUser);
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
}
