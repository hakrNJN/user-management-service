import 'reflect-metadata';
import {
    UserManagementError, UserNotFoundError, UserProfileExistsError,
    GroupNotFoundError, RoleNotFoundError, PermissionNotFoundError,
    UserAlreadyInGroupError, GroupExistsError, RoleExistsError,
    PermissionExistsError, AssignmentError, PolicyNotFoundError,
    PolicyExistsError, InvalidPolicySyntaxError, PolicyEngineAdapterError,
    AuthenticationError, InvalidCredentialsError, TokenExpiredError,
    InvalidTokenError, UserNotConfirmedError, PasswordResetRequiredError
} from '@src/domain/exceptions/UserManagementError';

describe('UserManagementError domain exceptions', () => {
    describe('AuthenticationError hierarchy', () => {
        it('AuthenticationError has correct defaults', () => {
            const e = new AuthenticationError();
            expect(e.message).toBe('Authentication Failed');
            expect(e.statusCode).toBe(401);
            expect(e.isOperational).toBe(true);
        });

        it('InvalidCredentialsError has correct message', () => {
            const e = new InvalidCredentialsError();
            expect(e.name).toBe('InvalidCredentialsError');
            expect(e.statusCode).toBe(401);
        });

        it('TokenExpiredError uses custom tokenType', () => {
            const e = new TokenExpiredError('RefreshToken');
            expect(e.message).toContain('RefreshToken has expired');
        });

        it('InvalidTokenError uses custom tokenType', () => {
            const e = new InvalidTokenError('AccessToken');
            expect(e.message).toContain('Invalid or malformed AccessToken');
        });

        it('UserNotConfirmedError uses 403', () => {
            const e = new UserNotConfirmedError();
            expect(e.statusCode).toBe(403);
        });

        it('PasswordResetRequiredError uses 400', () => {
            const e = new PasswordResetRequiredError();
            expect(e.statusCode).toBe(400);
        });
    });

    describe('UserManagementError hierarchy', () => {
        it('UserManagementError has correct defaults', () => {
            const e = new UserManagementError();
            expect(e.statusCode).toBe(400);
            expect(e.isOperational).toBe(true);
        });

        it('UserNotFoundError uses 404', () => {
            const e = new UserNotFoundError('user-1');
            expect(e.statusCode).toBe(404);
            expect(e.name).toBe('UserNotFoundError');
            expect(e.message).toContain('user-1');
        });

        it('UserProfileExistsError uses 409', () => {
            const e = new UserProfileExistsError('user-1');
            expect(e.statusCode).toBe(409);
        });

        it('GroupNotFoundError uses 404', () => {
            const e = new GroupNotFoundError('group-1');
            expect(e.statusCode).toBe(404);
            expect(e.name).toBe('GroupNotFoundError');
        });

        it('RoleNotFoundError uses 404', () => {
            const e = new RoleNotFoundError('admin');
            expect(e.statusCode).toBe(404);
            expect(e.name).toBe('RoleNotFoundError');
        });

        it('PermissionNotFoundError uses 404', () => {
            const e = new PermissionNotFoundError('read:all');
            expect(e.statusCode).toBe(404);
            expect(e.name).toBe('PermissionNotFoundError');
        });

        it('UserAlreadyInGroupError uses 409', () => {
            const e = new UserAlreadyInGroupError('alice', 'admins');
            expect(e.statusCode).toBe(409);
            expect(e.message).toContain('alice');
            expect(e.message).toContain('admins');
        });

        it('GroupExistsError uses 409', () => {
            const e = new GroupExistsError('admins');
            expect(e.statusCode).toBe(409);
            expect(e.name).toBe('GroupExistsError');
        });

        it('RoleExistsError uses 409', () => {
            const e = new RoleExistsError('admin');
            expect(e.statusCode).toBe(409);
        });

        it('PermissionExistsError uses 409', () => {
            const e = new PermissionExistsError('read:all');
            expect(e.statusCode).toBe(409);
        });

        it('AssignmentError uses 400', () => {
            const e = new AssignmentError('Bad assignment');
            expect(e.statusCode).toBe(400);
            expect(e.name).toBe('AssignmentError');
        });

        it('PolicyNotFoundError uses 404', () => {
            const e = new PolicyNotFoundError('policy-1');
            expect(e.statusCode).toBe(404);
            expect(e.name).toBe('PolicyNotFoundError');
        });

        it('PolicyExistsError uses 409', () => {
            const e = new PolicyExistsError('policy-1');
            expect(e.statusCode).toBe(409);
            expect(e.name).toBe('PolicyExistsError');
        });
    });

    describe('Specialized errors', () => {
        it('InvalidPolicySyntaxError stores policyName and language', () => {
            const e = new InvalidPolicySyntaxError('my-policy', 'rego', { detail: 'parse error' });
            expect(e.statusCode).toBe(400);
            expect(e.policyName).toBe('my-policy');
            expect(e.language).toBe('rego');
            expect(e.name).toBe('InvalidPolicySyntaxError');
        });

        it('PolicyEngineAdapterError is a 500 server error', () => {
            const e = new PolicyEngineAdapterError('timeout', 'evaluate', new Error('underlying'));
            expect(e.statusCode).toBe(500);
            expect(e.name).toBe('PolicyEngineAdapterError');
            expect(e.message).toContain('evaluate');
            expect(e.isOperational).toBe(false);
        });
    });
});
