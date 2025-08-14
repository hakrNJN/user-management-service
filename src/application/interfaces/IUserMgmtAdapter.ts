import { GroupType, UserType } from "@aws-sdk/client-cognito-identity-provider"; // Import relevant Cognito types

/**
 * Represents the structure for creating a new user via the admin API.
 */
export interface AdminCreateUserDetails {
    username: string;
    temporaryPassword?: string; // Optional: Cognito can generate one if not provided
    userAttributes: Record<string, string>; // e.g., { email: '...', name: '...', 'custom:department': '...' }
    suppressWelcomeMessage?: boolean; // Whether to suppress the welcome email with temp password
    forceAliasCreation?: boolean; // Allow overriding existing aliases if needed
    // Add other relevant options from AdminCreateUser command if needed
}

/**
 * Represents the structure for updating user attributes via the admin API.
 */
export interface AdminUpdateUserAttributesDetails {
    username: string;
    attributesToUpdate: Record<string, string>; // Attributes to set/update
    // attributesToDelete?: string[]; // Optional: Attributes to remove (if supported/needed)
}

/**
 * Represents the structure for creating a new group (role).
 */
export interface CreateGroupDetails {
    groupName: string;
    description?: string;
    precedence?: number; // Order of importance for role resolution
    // roleArn?: string; // IAM role to associate if needed
}

/**
 * Represents the structure for listing users with pagination.
 */
export interface ListUsersOptions {
    limit?: number;
    paginationToken?: string; // Token for next page
    filter?: string; // Filter expression (e.g., 'username ^= "john"')
    status?: string; // New: Filter by user status (e.g., CONFIRMED, UNCONFIRMED)
}

/**
 * Represents the result of listing users, including pagination info.
 */
export interface ListUsersResult {
    users: UserType[]; // Use Cognito's UserType
    paginationToken?: string; // Token for next page
}


/**
 * Defines the contract for interacting with the Identity Provider (IdP)
 * using **administrative privileges** for user and group management.
 */
export interface IUserMgmtAdapter {
    /**
     * Creates a new user in the IdP using admin credentials.
     * @param details - User details including username, attributes, and temporary password options.
     * @returns A promise resolving to the created user object (UserType).
     * @throws {ValidationError | UsernameExistsException | BaseError} For failures.
     */
    adminCreateUser(details: AdminCreateUserDetails): Promise<UserType>;

    /**
     * Retrieves details for a specific user using admin credentials.
     * @param username - The username of the user to retrieve.
     * @returns A promise resolving to the user object (UserType) or null if not found.
     * @throws {BaseError} For unexpected errors.
     */
    adminGetUser(username: string): Promise<UserType | null>;

    /**
     * Updates attributes for a specific user using admin credentials.
     * @param details - Details including username and attributes to update.
     * @returns A promise resolving when the update is complete.
     * @throws {NotFoundError | ValidationError | BaseError} For failures.
     */
    adminUpdateUserAttributes(details: AdminUpdateUserAttributesDetails): Promise<void>;

    /**
     * Deletes a user using admin credentials.
     * @param username - The username of the user to delete.
     * @returns A promise resolving when the deletion is complete.
     * @throws {NotFoundError | BaseError} For failures.
     */
    adminDeleteUser(username: string): Promise<void>;

    /**
     * Disables a user account using admin credentials.
     * @param username - The username of the user to disable.
     * @returns A promise resolving when the user is disabled.
     * @throws {NotFoundError | BaseError} For failures.
     */
    adminDisableUser(username: string): Promise<void>;

    /**
     * Enables a previously disabled user account using admin credentials.
     * @param username - The username of the user to enable.
     * @returns A promise resolving when the user is enabled.
     * @throws {NotFoundError | BaseError} For failures.
     */
    adminEnableUser(username: string): Promise<void>;

    /**
     * Initiates a password reset for a user using admin credentials (user receives code).
     * @param username - The username of the user.
     * @returns A promise resolving when the reset is initiated.
     * @throws {NotFoundError | BaseError} For failures.
     */
    adminInitiatePasswordReset(username: string): Promise<void>;

    /**
     * Sets a user's password directly using admin credentials (use with caution).
     * @param username - The username of the user.
     * @param password - The new password to set.
     * @param permanent - Whether the password should be permanent or require change on next login.
     * @returns A promise resolving when the password is set.
     * @throws {NotFoundError | ValidationError | BaseError} For failures.
     */
    adminSetUserPassword(username: string, password: string, permanent: boolean): Promise<void>;

    /**
     * Adds a user to a specified group (role) using admin credentials.
     * @param username - The username of the user.
     * @param groupName - The name of the group to add the user to.
     * @returns A promise resolving when the user is added to the group.
     * @throws {NotFoundError | ResourceNotFoundException (for group) | BaseError} For failures.
     */
    adminAddUserToGroup(username: string, groupName: string): Promise<void>;

    /**
     * Removes a user from a specified group (role) using admin credentials.
     * @param username - The username of the user.
     * @param groupName - The name of the group to remove the user from.
     * @returns A promise resolving when the user is removed from the group.
     * @throws {NotFoundError | BaseError} For failures.
     */
    adminRemoveUserFromGroup(username: string, groupName: string): Promise<void>;

    /**
     * Lists groups that a specific user belongs to.
     * @param username - The username of the user.
     * @param limit - Optional limit for pagination.
     * @param nextToken - Optional token for pagination.
     * @returns A promise resolving to the list of groups and a potential next token.
     * @throws {NotFoundError | BaseError} For failures.
     */
    adminListGroupsForUser(username: string, limit?: number, nextToken?: string): Promise<{ groups: GroupType[], nextToken?: string }>;

    /**
     * Lists users in the user pool, with optional filtering and pagination.
     * @param options - Options including limit, pagination token, and filter string.
     * @returns A promise resolving to the list of users and a potential pagination token.
     * @throws {BaseError} For failures.
     */
    adminListUsers(options: ListUsersOptions): Promise<ListUsersResult>;

    /**
     * Lists users belonging to a specific group.
     * @param groupName - The name of the group.
     * @param limit - Optional limit for pagination.
     * @param nextToken - Optional token for pagination.
     * @returns A promise resolving to the list of users and a potential next token.
     * @throws {ResourceNotFoundException (for group) | BaseError} For failures.
     */
    adminListUsersInGroup(groupName: string, limit?: number, nextToken?: string): Promise<{ users: UserType[], nextToken?: string }>;

    /**
     * Creates a new group (role) in the user pool.
     * @param details - Details for the group to be created.
     * @returns A promise resolving to the created group object.
     * @throws {GroupExistsException | ValidationError | BaseError} For failures.
     */
    adminCreateGroup(details: CreateGroupDetails): Promise<GroupType>;

    /**
     * Deletes a group (role) from the user pool.
     * @param groupName - The name of the group to delete.
     * @returns A promise resolving when the group is deleted.
     * @throws {ResourceNotFoundException | BaseError} For failures.
     */
    adminDeleteGroup(groupName: string): Promise<void>;

     /**
     * Retrieves details for a specific group.
     * @param groupName - The name of the group.
     * @returns A promise resolving to the group object or null if not found.
     * @throws {BaseError} For unexpected errors.
     */
     adminGetGroup(groupName: string): Promise<GroupType | null>;

    /**
     * Lists all groups (roles) in the user pool.
     * @param limit - Optional limit for pagination.
     * @param nextToken - Optional token for pagination.
     * @returns A promise resolving to the list of groups and a potential next token.
     * @throws {BaseError} For failures.
     */
    adminListGroups(limit?: number, nextToken?: string, filter?: string): Promise<{ groups: GroupType[], nextToken?: string }>;

    adminReactivateGroup(groupName: string): Promise<void>;

    // Add other admin-level methods as needed
}
