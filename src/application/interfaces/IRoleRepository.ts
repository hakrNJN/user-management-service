import { Role } from "../../domain/entities/Role";
import { QueryOptions, QueryResult } from "../../shared/types/query.types";

/**
 * Defines the contract for persistence operations related to Roles.
 */
export interface IRoleRepository {
    create(role: Role): Promise<void>;
    findByName(tenantId: string, roleName: string): Promise<Role | null>;
    list(tenantId: string, options?: QueryOptions): Promise<QueryResult<Role>>; // Use QueryResult for pagination
    update(tenantId: string, roleName: string, updates: Partial<Pick<Role, 'description'>>): Promise<Role | null>; // Return updated role
    delete(tenantId: string, roleName: string): Promise<boolean>; // Return true if deleted, false if not found
    // Add methods for finding roles by group, etc., if needed by specific queries
}
