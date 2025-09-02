import { BaseError } from '../../shared/errors/BaseError'; // Adjust path if BaseError moves

/**
 * Base class for specific authentication-related errors.
 * Inherits from BaseError for consistent handling.
 */
export class AuthenticationError extends BaseError {
    constructor(message = 'Authentication Failed', statusCode = 401) {
        // 401 Unauthorized is typical, but could be overridden (e.g., 403 for confirmed but forbidden)
        super('AuthenticationError', statusCode, message, true); // isOperational = true
        // Ensure the stack trace points correctly to where the error was instantiated
        if (typeof Error.captureStackTrace === 'function') {
            Error.captureStackTrace(this, this.constructor);
        }
        Object.setPrototypeOf(this, new.target.prototype);
    }
}


// --- Specific Authentication Errors ---

export class InvalidCredentialsError extends AuthenticationError {
    constructor(message = 'Invalid username or password.') {
        super(message, 401); // 401 Unauthorized
        this.name = 'InvalidCredentialsError';
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

export class UserNotConfirmedError extends AuthenticationError {
    constructor(message = 'User account is not confirmed.') {
        // Using 403 Forbidden might be more appropriate than 401 here,
        // as the user exists but isn't allowed access yet.
        super(message, 403);
        this.name = 'UserNotConfirmedError';
    }
}

export class PasswordResetRequiredError extends AuthenticationError {
    constructor(message = 'Password reset is required for this user.') {
        super(message, 400); // Bad Request or maybe a custom code/redirect
        this.name = 'PasswordResetRequiredError';
    }
}

/**
 * Base class for specific errors related to user, group, role, or permission management operations.
 */
export class UserManagementError extends BaseError {
    constructor(message = 'User management operation failed', statusCode = 400) {
        // Default to 400 Bad Request, but can be overridden
        super('UserManagementError', statusCode, message, true); // isOperational = true
        // Ensure the stack trace points correctly to where the error was instantiated
        if (typeof Error.captureStackTrace === 'function') {
            Error.captureStackTrace(this, this.constructor);
        }
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

// --- Specific Errors ---

export class UserNotFoundError extends UserManagementError {
    constructor(identifier: string) {
        super(`User with identifier '${identifier}' not found.`, 404);
        this.name = 'UserNotFoundError';
    }
}

export class UserProfileExistsError extends UserManagementError {
    constructor(userId: string) {
        super(`User profile with ID '${userId}' already exists.`, 409); // 409 Conflict
        this.name = 'UserProfileExistsError';
    }
}

export class GroupNotFoundError extends UserManagementError {
    constructor(groupName: string) {
        super(`Group '${groupName}' not found.`, 404);
        this.name = 'GroupNotFoundError';
    }
}

export class RoleNotFoundError extends UserManagementError { // New
    constructor(roleName: string) {
        super(`Role '${roleName}' not found.`, 404);
        this.name = 'RoleNotFoundError';
    }
}

export class PermissionNotFoundError extends UserManagementError { // New
    constructor(permissionName: string) {
        super(`Permission '${permissionName}' not found.`, 404);
        this.name = 'PermissionNotFoundError';
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

export class RoleExistsError extends UserManagementError { // New
    constructor(roleName: string) {
        super(`Role '${roleName}' already exists.`, 409); // 409 Conflict
        this.name = 'RoleExistsError';
    }
}

export class PermissionExistsError extends UserManagementError { // New
    constructor(permissionName: string) {
        super(`Permission '${permissionName}' already exists.`, 409); // 409 Conflict
        this.name = 'PermissionExistsError';
    }
}

export class AssignmentError extends UserManagementError { // New - Generic for assignment issues
    constructor(message: string) {
        super(message, 400); // Bad Request often suitable
        this.name = 'AssignmentError';
    }
}

// Add other specific errors as needed

// --- Specific Policy Errors ---

export class PolicyNotFoundError extends UserManagementError {
    constructor(identifier: string) { // identifier could be name or ID
        super(`Policy with identifier '${identifier}' not found.`, 404);
        this.name = 'PolicyNotFoundError';
    }
}

export class PolicyExistsError extends UserManagementError {
    constructor(policyName: string) {
        super(`Policy '${policyName}' already exists.`, 409); // 409 Conflict
        this.name = 'PolicyExistsError';
    }
}

export class InvalidPolicySyntaxError extends BaseError { // Inherit directly from BaseError
    public readonly policyName: string;
    public readonly language: string;

    constructor(policyName: string, language: string, details?: any) {
        const message = `Policy '${policyName}' has invalid syntax for language '${language}'.`;
        // Call BaseError constructor directly: (name, statusCode, message, isOperational, details)
        super('InvalidPolicySyntaxError', 400, message, true, details);
        this.policyName = policyName;
        this.language = language;
        // Ensure the stack trace points correctly to where the error was instantiated
        if (typeof Error.captureStackTrace === 'function') {
            Error.captureStackTrace(this, this.constructor);
        }
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

export class PolicyEngineAdapterError extends BaseError { // Inherit directly from BaseError
    constructor(message: string, operation: string, underlyingError?: any) {
        // Typically a server-side issue interacting with the policy engine/storage
        super('PolicyEngineAdapterError', 500, `Policy Engine Adapter failed during operation '${operation}': ${message}`, false, { underlyingError: underlyingError?.message });
        this.name = 'PolicyEngineAdapterError';
        // Ensure the stack trace points correctly to where the error was instantiated
        if (typeof Error.captureStackTrace === 'function') {
            Error.captureStackTrace(this, this.constructor);
        }
        Object.setPrototypeOf(this, new.target.prototype);
    }
}