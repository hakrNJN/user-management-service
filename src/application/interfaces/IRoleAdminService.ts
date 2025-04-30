import { Role } from "../../domain/entities/Role";
import { AdminUser } from "../../shared/types/admin-user.interface";
import { QueryOptions, QueryResult } from "./IUserProfileRepository";

/**
 * Defines the contract for the Role Administration application logic.
 */
export interface IRoleAdminService {
    createRole(adminUser: AdminUser, details: { roleName: string; description?: string }): Promise<Role>;
    getRole(adminUser: AdminUser, roleName: string): Promise<Role | null>;
    listRoles(adminUser: AdminUser, options?: QueryOptions): Promise<QueryResult<Role>>;
    updateRole(adminUser: AdminUser, roleName: string, updates: { description?: string }): Promise<Role | null>;
    deleteRole(adminUser: AdminUser, roleName: string): Promise<void>;
    assignPermissionToRole(adminUser: AdminUser, roleName: string, permissionName: string): Promise<void>;
    removePermissionFromRole(adminUser: AdminUser, roleName: string, permissionName: string): Promise<void>;
    listPermissionsForRole(adminUser: AdminUser, roleName: string): Promise<string[]>; // Return permission names
}
