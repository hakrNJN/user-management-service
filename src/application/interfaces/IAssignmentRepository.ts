/**
 * Defines the contract for managing relationships (assignments) between
 * users, groups, roles, and permissions.
 * The implementation will depend heavily on the chosen database schema (e.g., adjacency list).
 */
export interface IAssignmentRepository {
    // --- Group <-> Role ---
    findRolesByGroupName(groupName: string): Promise<string[]>; // Returns role names
    assignRoleToGroup(groupName: string, roleName: string): Promise<void>;
    removeRoleFromGroup(groupName: string, roleName: string): Promise<void>;
    findGroupsByRoleName(roleName: string): Promise<string[]>; // Returns group names

    // --- Role <-> Permission ---
    findPermissionsByRoleName(roleName: string): Promise<string[]>; // Returns permission names
    assignPermissionToRole(roleName: string, permissionName: string): Promise<void>;
    removePermissionFromRole(roleName: string, permissionName: string): Promise<void>;
    findRolesByPermissionName(permissionName: string): Promise<string[]>; // Returns role names

    // --- User <-> Custom Role ---
    findCustomRolesByUserId(userId: string): Promise<string[]>; // Returns role names
    assignCustomRoleToUser(userId: string, roleName: string): Promise<void>;
    removeCustomRoleFromUser(userId: string, roleName: string): Promise<void>;
    findUsersByRoleName(roleName: string): Promise<string[]>; // Returns user IDs

    // --- User <-> Custom Permission ---
    findCustomPermissionsByUserId(userId: string): Promise<string[]>; // Returns permission names
    assignCustomPermissionToUser(userId: string, permissionName: string): Promise<void>;
    removeCustomPermissionFromUser(userId: string, permissionName: string): Promise<void>;
    findUsersByPermissionName(permissionName: string): Promise<string[]>; // Returns user IDs

    // --- Cleanup (Optional but useful) ---
    // Remove all assignments related to a deleted user/group/role/permission
    removeAllAssignmentsForUser(userId: string): Promise<void>;
    removeAllAssignmentsForGroup(groupName: string): Promise<void>;
    removeAllAssignmentsForRole(roleName: string): Promise<void>;
    removeAllAssignmentsForPermission(permissionName: string): Promise<void>;
}
