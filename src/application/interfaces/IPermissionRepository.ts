import { Permission } from "../../domain/entities/Permission";
import { QueryOptions, QueryResult } from "../../shared/types/query.types";

/**
 * Defines the contract for persistence operations related to Permissions.
 */
export interface IPermissionRepository {
    create(permission: Permission): Promise<void>;
    findByName(tenantId: string, permissionName: string): Promise<Permission | null>;
    list(tenantId: string, options?: QueryOptions): Promise<QueryResult<Permission>>;
    update(tenantId: string, permissionName: string, updates: Partial<Pick<Permission, 'description'>>): Promise<Permission | null>;
    delete(tenantId: string, permissionName: string): Promise<boolean>;
    // Add methods for finding permissions by role, etc.
}
