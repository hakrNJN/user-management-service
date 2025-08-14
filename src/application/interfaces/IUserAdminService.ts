import { AdminUserView } from "../../domain/entities/AdminUserView"; // Import domain entity
import { AdminCreateUserDetails, AdminUpdateUserAttributesDetails, ListUsersOptions } from "./IUserMgmtAdapter"; // Import related types

/**
 * Defines the contract for the User Administration application logic.
 */
export interface IUserAdminService {
    /**
     * Creates a new user via administrative action.
     * @param adminUser - The authenticated admin performing the action.
     * @param details - Details for the new user.
     * @returns A promise resolving to a view model of the created user.
     * @throws {ValidationError | BaseError} For failures.
     */
    createUser(adminUser: AdminUser, details: AdminCreateUserDetails): Promise<AdminUserView>;

    /**
     * Retrieves details for a specific user.
     * @param adminUser - The authenticated admin performing the action.
     * @param username - The username of the user to retrieve.
     * @returns A promise resolving to a view model of the user, or null if not found.
     * @throws {BaseError} For unexpected errors.
     */
    getUser(adminUser: AdminUser, username: string): Promise<AdminUserView | null>;

    /**
     * Lists users based on specified criteria.
     * @param adminUser - The authenticated admin performing the action.
     * @param options - Filtering and pagination options.
     * @returns A promise resolving to the list of user view models and pagination token.
     * @throws {BaseError} For failures.
     */
    listUsers(adminUser: AdminUser, options: ListUsersOptions): Promise<{ users: AdminUserView[], paginationToken?: string }>;

    /**
     * Updates attributes for a specific user.
     * @param adminUser - The authenticated admin performing the action.
     * @param details - Details including username and attributes to update.
     * @returns A promise resolving upon successful update.
     * @throws {NotFoundError | ValidationError | BaseError} For failures.
     */
    updateUserAttributes(adminUser: AdminUser, details: AdminUpdateUserAttributesDetails): Promise<void>;

    /**
     * Deletes a user.
     * @param adminUser - The authenticated admin performing the action.
     * @param username - The username of the user to delete.
     * @returns A promise resolving upon successful deletion.
     * @throws {NotFoundError | BaseError} For failures.
     */
    deleteUser(adminUser: AdminUser, username: string): Promise<void>;

    /**
     * Disables a user account.
     * @param adminUser - The authenticated admin performing the action.
     * @param username - The username of the user to disable.
     * @returns A promise resolving upon successful disabling.
     * @throws {NotFoundError | BaseError} For failures.
     */
    disableUser(adminUser: AdminUser, username: string): Promise<void>;

    /**
     * Enables a user account.
     * @param adminUser - The authenticated admin performing the action.
     * @param username - The username of the user to enable.
     * @returns A promise resolving upon successful enabling.
     * @throws {NotFoundError | BaseError} For failures.
     */
    enableUser(adminUser: AdminUser, username: string): Promise<void>;

    /**
     * Initiates a password reset for a user.
     * @param adminUser - The authenticated admin performing the action.
     * @param username - The username of the user.
     * @returns A promise resolving upon successful initiation.
     * @throws {NotFoundError | BaseError} For failures.
     */
    initiatePasswordReset(adminUser: AdminUser, username: string): Promise<void>;

    /**
     * Sets a user's password directly. Use with caution.
     * @param adminUser - The authenticated admin performing the action.
     * @param username - The username of the user.
     * @param password - The new password.
     * @param permanent - Whether the password requires change on next login.
     * @returns A promise resolving upon successful password set.
     * @throws {NotFoundError | ValidationError | BaseError} For failures.
     */
    setUserPassword(adminUser: AdminUser, username: string, password: string, permanent: boolean): Promise<void>;

    /**
     * Adds a user to a group.
     * @param adminUser - The authenticated admin performing the action.
     * @param username - The username of the user.
     * @param groupName - The name of the group.
     * @returns A promise resolving upon successful addition.
     * @throws {NotFoundError | ResourceNotFoundException | UserAlreadyInGroupError | BaseError} For failures.
     */
    addUserToGroup(adminUser: AdminUser, username: string, groupName: string): Promise<void>;

    /**
     * Removes a user from a group.
     * @param adminUser - The authenticated admin performing the action.
     * @param username - The username of the user.
     * @param groupName - The name of the group.
     * @returns A promise resolving upon successful removal.
     * @throws {NotFoundError | BaseError} For failures.
     */
    removeUserFromGroup(adminUser: AdminUser, username: string, groupName: string): Promise<void>;

     /**
     * Lists groups for a specific user.
     * @param adminUser - The authenticated admin performing the action.
     * @param username - The username of the user.
     * @param limit - Optional limit.
     * @param nextToken - Optional pagination token.
     * @returns A promise resolving to the list of groups and next token.
     */
     listGroupsForUser(adminUser: AdminUser, username: string, limit?: number, nextToken?: string): Promise<{ groups: Group[], nextToken?: string }>; // Return domain Group entity

     /**
     * Lists users within a specific group.
     * @param adminUser - The authenticated admin performing the action.
     * @param groupName - The name of the group.
     * @param limit - Optional limit.
     * @param nextToken - Optional pagination token.
     * @returns A promise resolving to the list of user view models and next token.
     */
     listUsersInGroup(adminUser: AdminUser, groupName: string, limit?: number, nextToken?: string): Promise<{ users: AdminUserView[], nextToken?: string }>;

    /**
     * Updates a user's group memberships, adding them to new groups and removing them from old ones.
     * @param adminUser - The authenticated admin performing the action.
     * @param username - The username of the user.
     * @param groupNames - An array of group names the user should belong to.
     * @returns A promise resolving upon successful update.
     * @throws {NotFoundError | BaseError} For failures.
     */
    updateUserGroups(adminUser: AdminUser, username: string, groupNames: string[]): Promise<void>;
}

// Define AdminUser type based on the shared interface
import { Group } from "../../domain/entities/Group";
import { AdminUser } from "../../shared/types/admin-user.interface";

