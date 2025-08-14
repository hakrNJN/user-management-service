/**
 * Defines the structure of the user object attached to the Express Request
 * object by the authentication guard middleware after successful JWT validation.
 */
export interface AuthenticatedUser {
    /**
     * The unique identifier for the user (typically the 'sub' claim from the JWT).
     */
    id: string;

    /**
     * The username associated with the user (typically the 'username' or 'cognito:username' claim).
     */
    username: string;

    /**
     * An object containing all decoded attributes/claims from the validated access token.
     * This allows access to custom attributes, email, phone_number, etc.
     */
    attributes: Record<string, any>;

    /**
     * Optional array of roles or groups the user belongs to (e.g., from 'cognito:groups' claim).
     * Used for RBAC checks.
     */
    roles?: string[];

    // Add any other frequently accessed, derived, or standardized properties needed from the token.
}

// --- Declaration Merging (Alternative: place in a separate .d.ts file) ---
// This adds the 'user' property directly to the Express Request interface for better type safety.
declare global {
    namespace Express {
        interface Request {
            /**
             * Holds information about the authenticated user, attached by the auth guard middleware.
             */
            user?: AuthenticatedUser;
             /**
             * Holds the unique request ID, attached by the requestId middleware.
             */
            id?: string;
            accessToken?: string;
        }
    }
}
// Adding an empty export statement turns this file into a module,
// which is necessary for the global augmentation to be applied correctly.
export { };

