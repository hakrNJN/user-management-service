/**
 * Defines the structure of the administrative user object attached to the Express Request
 * object by the admin authentication guard middleware after successful JWT validation
 * and authorization checks (e.g., checking for 'admin' group membership).
 */
export interface AdminUser {
    /**
     * The unique identifier for the admin user (typically the 'sub' claim).
     */
    id: string;

    /**
     * The tenant identifier this admin user belongs to.
     */
    tenantId: string;

    /**
     * The username of the admin user.
     */
    username: string;

    /**
     * An array of roles or groups the admin user belongs to.
     * Used to verify administrative privileges.
     */
    roles: string[];

    /**
     * Optional: All decoded attributes/claims from the validated access token.
     */
    attributes?: Record<string, any>;
}

// --- Declaration Merging (Alternative: place in a separate .d.ts file) ---
// Adds 'adminUser' property to the Express Request interface.
declare global {
    namespace Express {
        interface Request {
            /**
             * Holds information about the authenticated *administrative* user,
             * attached by the admin auth guard middleware.
             */
            adminUser?: AdminUser;
            /**
            * Holds the unique request ID, attached by the requestId middleware.
            */
            id?: string; // Keep request ID as well
        }
    }
}
// Adding an empty export statement turns this file into a module.
export { };

