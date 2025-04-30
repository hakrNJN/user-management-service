import { Role } from "../../domain/entities/Role";
import { QueryOptions, QueryResult } from "./IUserProfileRepository"; // Reuse pagination types if suitable

/**
 * Defines the contract for persistence operations related to Roles.
 */
export interface IRoleRepository {
    create(role: Role): Promise<void>;
    findByName(roleName: string): Promise<Role | null>;
    list(options?: QueryOptions): Promise<QueryResult<Role>>; // Use QueryResult for pagination
    update(roleName: string, updates: Partial<Pick<Role, 'description'>>): Promise<Role | null>; // Return updated role
    delete(roleName: string): Promise<boolean>; // Return true if deleted, false if not found
    // Add methods for finding roles by group, etc., if needed by specific queries
}
