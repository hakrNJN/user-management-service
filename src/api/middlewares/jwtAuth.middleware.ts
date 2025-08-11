import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { ILogger } from '../../../application/interfaces/ILogger';
import { AuthenticationError } from '../../../domain/exceptions/UserManagementError'; // Assuming a UserManagementError for auth
import { TYPES } from '../../../shared/constants/types';
import { JwtValidator } from '../../../../authentication-service/src/shared/utils/jwtValidator'; // Adjust path as needed
import { ITokenBlacklistService } from '../../../../authentication-service/src/application/interfaces/ITokenBlacklistService';

// Extend the Request type to include user property
declare global {
    namespace Express {
        interface Request {
            user?: any; // Or a more specific user type if available
            accessToken?: string; // To store the raw access token
        }
    }
}

export function jwtAuthMiddleware() {
    const logger = container.resolve<ILogger>(TYPES.Logger);
    const jwtValidator = new JwtValidator(); // Instantiate the validator
    const tokenBlacklistService = container.resolve<ITokenBlacklistService>(TYPES.TokenBlacklistService);

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
            if (decodedToken.jti && await tokenBlacklistService.isBlacklisted(decodedToken.jti)) {
                logger.warn(`Authentication: Token ${decodedToken.jti} is blacklisted.`);
                return next(new AuthenticationError('Token has been revoked.'));
            }

            req.user = decodedToken; // Attach decoded token (user info) to request
            req.accessToken = token; // Attach raw token to request
            next();
        } catch (error: any) {
            logger.error(`Authentication failed for token: ${error.message}`, error);
            next(new AuthenticationError(`Authentication failed: ${error.message}`));
        }
    };
}
