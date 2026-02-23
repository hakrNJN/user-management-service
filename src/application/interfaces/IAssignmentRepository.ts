/**
 * Defines the contract for managing relationships (assignments) between
 * users, groups, roles, and permissions in a multi-tenant environment.
 */
export interface IAssignmentRepository {
    // --- Group <-> Role ---
    findRolesByGroupName(tenantId: string, groupName: string): Promise<string[]>;
    assignRoleToGroup(tenantId: string, groupName: string, roleName: string): Promise<void>;
    removeRoleFromGroup(tenantId: string, groupName: string, roleName: string): Promise<void>;
    findGroupsByRoleName(tenantId: string, roleName: string): Promise<string[]>;

    // --- Role <-> Permission ---
    findPermissionsByRoleName(tenantId: string, roleName: string): Promise<string[]>;
    assignPermissionToRole(tenantId: string, roleName: string, permissionName: string): Promise<void>;
    removePermissionFromRole(tenantId: string, roleName: string, permissionName: string): Promise<void>;
    findRolesByPermissionName(tenantId: string, permissionName: string): Promise<string[]>;

    // --- User <-> Custom Role ---
    findCustomRolesByUserId(tenantId: string, userId: string): Promise<string[]>;
    assignCustomRoleToUser(tenantId: string, userId: string, roleName: string): Promise<void>;
    removeCustomRoleFromUser(tenantId: string, userId: string, roleName: string): Promise<void>;
    findUsersByRoleName(tenantId: string, roleName: string): Promise<string[]>;

    // --- User <-> Custom Permission ---
    findCustomPermissionsByUserId(tenantId: string, userId: string): Promise<string[]>;
    assignCustomPermissionToUser(tenantId: string, userId: string, permissionName: string): Promise<void>;
    removeCustomPermissionFromUser(tenantId: string, userId: string, permissionName: string): Promise<void>;
    findUsersByPermissionName(tenantId: string, permissionName: string): Promise<string[]>;

    // --- Cleanup ---
    removeAllAssignmentsForUser(tenantId: string, userId: string): Promise<void>;
    removeAllAssignmentsForGroup(tenantId: string, groupName: string): Promise<void>;
    removeAllAssignmentsForRole(tenantId: string, roleName: string): Promise<void>;
    removeAllAssignmentsForPermission(tenantId: string, permissionName: string): Promise<void>;
}
