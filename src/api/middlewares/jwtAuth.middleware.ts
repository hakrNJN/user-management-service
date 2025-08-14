import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { ILogger } from '../../application/interfaces/ILogger';
import { AuthenticationError } from '../../domain/exceptions/UserManagementError'; // Assuming a UserManagementError for auth
import { TYPES } from '../../shared/constants/types';
import { JwtValidator } from '../../../../authentication-service/src/shared/utils/jwtValidator'; // Adjust path as needed
import { AuthenticatedUser } from '../../shared/types/authenticated-user.interface';


// Extend the Request type to include user property


export function jwtAuthMiddleware() {
    const logger = container.resolve<ILogger>(TYPES.Logger);
    const jwtValidator = new JwtValidator(); // Instantiate the validator
    // const tokenBlacklistService = container.resolve<ITokenBlacklistService>(TYPES.TokenBlacklistService);

    return async (req: Request, res: Response, next: NextFunction) => {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            logger.warn('Authentication: Missing or invalid Authorization header.');
            return next(new AuthenticationError('Authorization header missing or invalid.'));
        }

        const token = authHeader.split(' ')[1];

        try {
            const decodedToken = await jwtValidator.validateJwt(token);

            // Check if token is blacklisted
            // if (decodedToken.jti && await tokenBlacklistService.isBlacklisted(decodedToken.jti)) {
            //     logger.warn(`Authentication: Token ${decodedToken.jti} is blacklisted.`);
            //     return next(new AuthenticationError('Token has been revoked.'));
            // }

            const userGroups: string[] = (decodedToken as any)['cognito:groups'] || [];

            req.user = {
                id: (decodedToken as any).sub ?? 'unknown-sub',
                username: (decodedToken as any)['cognito:username'] ?? (decodedToken as any).email ?? 'unknown-username',
                roles: userGroups,
                attributes: decodedToken,
            } as AuthenticatedUser;

            req.accessToken = token; // Attach raw token to request
            next();
        } catch (error: any) {
            logger.error(`Authentication failed for token: ${error.message}`, error);
            next(new AuthenticationError(`Authentication failed: ${error.message}`));
        }
    };
}
