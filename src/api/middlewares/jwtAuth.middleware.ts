import { NextFunction, Request, Response } from 'express';
import { container } from 'tsyringe';
import { ILogger } from '../../application/interfaces/ILogger';
import { AuthenticationError } from '../../domain/exceptions/UserManagementError'; // Assuming a UserManagementError for auth
import { TYPES } from '../../shared/constants/types';
import { JwtValidator } from '../../shared/utils/jwtValidator';


// Extend Express Request type to include our custom properties
import { AuthenticatedUser } from '../../shared/types/authenticated-user.interface';

declare global {
    namespace Express {
        interface Request {
            user?: AuthenticatedUser | undefined;
            accessToken?: string | undefined;
        }
    }
}


export function jwtAuthMiddleware() {
    const logger = container.resolve<ILogger>(TYPES.Logger);
    const jwtValidator = container.resolve<JwtValidator>(TYPES.JwtValidator);
    // const tokenBlacklistService = container.resolve<ITokenBlacklistService>(TYPES.TokenBlacklistService);

    return async (req: Request, res: Response, next: NextFunction) => {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            logger.warn('Authentication: Missing or invalid Authorization header.');
            return next(new AuthenticationError('Authorization header missing or invalid.'));
        }

        const token = authHeader.split(' ')[1];

        try {
            const decodedToken = await jwtValidator.validate(token);

            // Check if token is blacklisted
            // if (decodedToken.jti && await tokenBlacklistService.isBlacklisted(decodedToken.jti)) {
            //     logger.warn(`Authentication: Token ${decodedToken.jti} is blacklisted.`);
            //     return next(new AuthenticationError('Token has been revoked.'));
            // }

            // Extract user information from token
            const userGroups: string[] = decodedToken['cognito:groups'] || [];
            const sub = decodedToken.sub;
            const username = decodedToken['cognito:username'] || decodedToken.email;

            if (!sub || !username) {
                throw new Error('Missing required user information in token');
            }

            req.user = {
                id: sub,
                username: username,
                roles: userGroups,
                attributes: decodedToken
            };

            req.accessToken = token; // Attach raw token to request
            next();
        } catch (error: any) {
            logger.error(`Authentication failed for token: ${error.message}`, error);
            next(new AuthenticationError(`Authentication failed: ${error.message}`));
        }
    };
}
