import { NextFunction, Request, Response } from 'express';
import { IConfigService } from '../../application/interfaces/IConfigService';
import { ILogger } from '../../application/interfaces/ILogger';
import { container } from '../../container';
import { AuthenticationError } from '../../domain/exceptions/UserManagementError';
import { TYPES } from '../../shared/constants/types';
import { BaseError } from '../../shared/errors/BaseError';
import { AdminUser } from '../../shared/types/admin-user.interface';

/**
 * Factory function to create the Admin Authentication Guard middleware.
 * Assumes JWT validation has already been performed by a preceding middleware (e.g., jwtAuthMiddleware).
 * Checks for required admin roles/groups and populates req.adminUser.
 *
 * @param requiredAdminRole - The role/group name required for access (e.g., 'admin').
 * @returns An Express middleware function.
 */
export const createAdminAuthGuardMiddleware = (
    requiredAdminRole: string,
    injectedLogger?: ILogger,
    injectedConfigService?: IConfigService
): ((req: Request, res: Response, next: NextFunction) => Promise<void>) => {
    // Resolve dependencies needed by the guard
    const logger = injectedLogger ?? container.resolve<ILogger>(TYPES.Logger);
    const configService = injectedConfigService ?? container.resolve<IConfigService>(TYPES.ConfigService);

    // Return the actual middleware function
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const requestId = req.id || 'N/A';

        try {
            // Assume req.user is populated by jwtAuthMiddleware
            if (!req.user) {
                logger.error(`[AdminGuard - ${requestId}] Authentication failed: req.user not populated. Ensure jwtAuthMiddleware runs before this guard.`);
                throw new AuthenticationError('Authentication required.');
            }

            const decodedPayload = req.user; // req.user should be the decoded JWT payload

            // --- Authorization Check ---
            const userGroups: string[] = (decodedPayload as any)['cognito:groups'] || [];

            if (!userGroups.includes(requiredAdminRole)) {
                logger.warn(`[AdminGuard - ${requestId}] Authorization failed: User lacks required role '${requiredAdminRole}'.`, { userGroups, userId: (decodedPayload as any).sub });
                throw new BaseError('ForbiddenError', 403, `Access denied. Required role '${requiredAdminRole}' missing.`, true);
            }

            // --- Attach Admin User Context ---
            req.adminUser = {
                id: (decodedPayload as any).sub ?? 'unknown-sub',
                username: (decodedPayload as any)['cognito:username'] ?? (decodedPayload as any).email ?? 'unknown-username',
                roles: userGroups,
                attributes: decodedPayload,
            } as AdminUser; // Cast to AdminUser

            logger.info(`[AdminGuard - ${requestId}] Admin authentication successful for user: ${req.adminUser.username} (ID: ${req.adminUser.id})`);
            next();

        } catch (error: any) {
            logger.error(`[AdminGuard - ${requestId}] Error during admin authorization: ${error.message}`, error);
            next(error);
        }
    };
};
