import { BaseError } from '../../shared/errors/BaseError'; // Adjust path if BaseError moves

/**
 * Base class for specific errors related to user management operations.
 */
export class UserManagementError extends BaseError {
    constructor(message = 'User management operation failed', statusCode = 400) {
        // Default to 400 Bad Request, but can be overridden
        super('UserManagementError', statusCode, message, true); // isOperational = true
    }
}

/**
 * Base class for specific authentication-related errors.
 * Inherits from BaseError for consistent handling.
 */
export class AuthenticationError extends BaseError {
    constructor(message = 'Authentication Failed', statusCode = 401) {
        // 401 Unauthorized is typical, but could be overridden (e.g., 403 for confirmed but forbidden)
        super('AuthenticationError', statusCode, message, true); // isOperational = true
    }
}

// --- Specific User Management Errors ---

export class UserNotFoundError extends UserManagementError {
    constructor(identifier: string) {
        super(`User with identifier '${identifier}' not found.`, 404);
        this.name = 'UserNotFoundError';
    }
}

export class GroupNotFoundError extends UserManagementError {
    constructor(groupName: string) {
        super(`Group '${groupName}' not found.`, 404);
        this.name = 'GroupNotFoundError';
    }
}

export class UserAlreadyInGroupError extends UserManagementError {
    constructor(username: string, groupName: string) {
        super(`User '${username}' is already a member of group '${groupName}'.`, 409); // 409 Conflict
        this.name = 'UserAlreadyInGroupError';
    }
}

export class GroupExistsError extends UserManagementError {
     constructor(groupName: string) {
        super(`Group '${groupName}' already exists.`, 409); // 409 Conflict
        this.name = 'GroupExistsError';
    }
}

export class UserNotInGroupError extends UserManagementError {
    constructor(username: string, groupName: string) {
        super(`User '${username}' is not a member of group '${groupName}'.`, 400); // 400 Bad Request
        this.name = 'UserNotInGroupError';
    }
}

export class UserAlreadyExistsError extends UserManagementError {
    constructor(username: string) {
        super(`User '${username}' already exists.`, 409); // 409 Conflict
        this.name = 'UserAlreadyExistsError';
    }
}

export class InvalidAttributeError extends UserManagementError {
    constructor(attributeName: string, reason?: string) {
        const message = reason ? `Invalid value for attribute '${attributeName}': ${reason}` : `Invalid value for attribute '${attributeName}'.`;
        super(message, 400); // 400 Bad Request
        this.name = 'InvalidAttributeError';
    }
}

export class CannotDeleteSelfError extends UserManagementError {
    constructor() {
        super('Cannot delete your own account.', 400); // 400 Bad Request
        this.name = 'CannotDeleteSelfError';
    }
}

export class TokenExpiredError extends AuthenticationError {
    constructor(tokenType = 'Token') {
        super(`${tokenType} has expired.`, 401); // 401 Unauthorized
        this.name = 'TokenExpiredError';
    }
}

export class InvalidTokenError extends AuthenticationError {
    constructor(tokenType = 'Token') {
        super(`Invalid or malformed ${tokenType}.`, 401); // 401 Unauthorized
        this.name = 'InvalidTokenError';
    }
}


// Add other specific errors as needed (e.g., InvalidAttributeError)
