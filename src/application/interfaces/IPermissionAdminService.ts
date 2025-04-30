import { Permission } from "../../domain/entities/Permission";
import { AdminUser } from "../../shared/types/admin-user.interface";
import { QueryOptions, QueryResult } from "./IUserProfileRepository";

/**
 * Defines the contract for the Permission Administration application logic.
 */
export interface IPermissionAdminService {
    createPermission(adminUser: AdminUser, details: { permissionName: string; description?: string }): Promise<Permission>;
    getPermission(adminUser: AdminUser, permissionName: string): Promise<Permission | null>;
    listPermissions(adminUser: AdminUser, options?: QueryOptions): Promise<QueryResult<Permission>>;
    updatePermission(adminUser: AdminUser, permissionName: string, updates: { description?: string }): Promise<Permission | null>;
    deletePermission(adminUser: AdminUser, permissionName: string): Promise<void>;
    listRolesForPermission(adminUser: AdminUser, permissionName: string): Promise<string[]>; // Return role names
}
