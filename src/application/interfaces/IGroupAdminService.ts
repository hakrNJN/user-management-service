import { Group } from "../../domain/entities/Group"; // Import domain entity
import { AdminUser } from "../../shared/types/admin-user.interface"; // Import admin user type
import { CreateGroupDetails } from "./IUserMgmtAdapter"; // Import related type

/**
 * Defines the contract for the Group Administration application logic.
 */
export interface IGroupAdminService {
    /**
     * Creates a new group (role).
     * @param adminUser - The authenticated admin performing the action.
     * @param details - Details for the new group.
     * @returns A promise resolving to the created Group domain entity.
     * @throws {GroupExistsError | ValidationError | BaseError} For failures.
     */
    createGroup(adminUser: AdminUser, details: CreateGroupDetails): Promise<Group>;

    /**
     * Retrieves details for a specific group.
     * @param adminUser - The authenticated admin performing the action.
     * @param groupName - The name of the group.
     * @returns A promise resolving to the Group domain entity or null if not found.
     * @throws {BaseError} For unexpected errors.
     */
    getGroup(adminUser: AdminUser, groupName: string): Promise<Group | null>;

    /**
     * Lists all groups in the user pool.
     * @param adminUser - The authenticated admin performing the action.
     * @param limit - Optional limit for pagination.
     * @param nextToken - Optional token for pagination.
     * @returns A promise resolving to the list of Group domain entities and a potential next token.
     * @throws {BaseError} For failures.
     */
    listGroups(adminUser: AdminUser, limit?: number, nextToken?: string): Promise<{ groups: Group[], nextToken?: string }>;

    /**
     * Deletes a group.
     * @param adminUser - The authenticated admin performing the action.
     * @param groupName - The name of the group to delete.
     * @returns A promise resolving upon successful deletion.
     * @throws {ResourceNotFoundException | BaseError} For failures.
     */
    deleteGroup(adminUser: AdminUser, groupName: string): Promise<void>;

    // Add updateGroup if needed (Cognito's UpdateGroup is limited)
    // updateGroup(adminUser: AdminUser, groupName: string, updates: UpdateGroupDetails): Promise<Group>;
}
