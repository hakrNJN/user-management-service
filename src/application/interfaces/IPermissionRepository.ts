import { Permission } from "../../domain/entities/Permission";
import { QueryOptions, QueryResult } from "../../shared/types/query.types";

/**
 * Defines the contract for persistence operations related to Permissions.
 */
export interface IPermissionRepository {
    create(permission: Permission): Promise<void>;
    findByName(permissionName: string): Promise<Permission | null>;
    list(options?: QueryOptions): Promise<QueryResult<Permission>>;
    update(permissionName: string, updates: Partial<Pick<Permission, 'description'>>): Promise<Permission | null>;
    delete(permissionName: string): Promise<boolean>;
    // Add methods for finding permissions by role, etc.
}
