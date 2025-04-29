import { NextFunction, Request, Response } from 'express';
import { ILogger } from '../../application/interfaces/ILogger';
import { container } from '../../container';
import { TYPES } from '../../shared/constants/types';
// Use the *User Management* Adapter here if needed to fetch user details/groups
// Or rely solely on JWT claims if sufficient
import { AuthenticationError, InvalidTokenError, TokenExpiredError } from '../../domain/exceptions/UserManagementError'; // Use domain errors
import { BaseError } from '../../shared/errors/BaseError';
// Import a JWT verification library (e.g., jsonwebtoken) and JWKS client
// Import types along with the library itself after installing @types/jsonwebtoken
import jwt, { JwtHeader, JwtPayload, SigningKeyCallback, VerifyErrors } from 'jsonwebtoken';
import jwksClient, { JwksClient } from 'jwks-rsa'; // Requires: pnpm add jsonwebtoken jwks-rsa @types/jsonwebtoken @types/jwks-rsa (optional but good practice)
import { IConfigService } from '../../application/interfaces/IConfigService';
import { AdminUser } from '../../shared/types/admin-user.interface';

const TEST_ENV_BEARER_TOKEN = 'valid-test-token-for-admin-bypass-12345';
// Define the structure of the admin user attached to the request
// Using declaration merging from shared/types/admin-user.interface.ts

/**
 * Factory function to create the Admin Authentication Guard middleware.
 * Verifies JWT, checks for required admin roles/groups.
 *
 * @param requiredAdminRole - The role/group name required for access (e.g., 'admin').
 * @returns An Express middleware function.
 */
export const createAdminAuthGuardMiddleware = (requiredAdminRole: string): ((req: Request, res: Response, next: NextFunction) => Promise<void>) => {
    // Resolve dependencies needed by the guard
    const logger = container.resolve<ILogger>(TYPES.Logger);
    const configService = container.resolve<IConfigService>(TYPES.ConfigService); // Needed for JWKS URI, Issuer
    // const userMgmtAdapter = container.resolve<IUserMgmtAdapter>(TYPES.UserMgmtAdapter); // Optional: if fetching extra details

    // --- JWKS Client Setup (for local JWT verification) ---
    // Fetch these from config
    const jwksUri = configService.get('COGNITO_JWKS_URI'); // e.g., https://cognito-idp.{region}.amazonaws.com/{userPoolId}/.well-known/jwks.json
    const issuer = configService.get('COGNITO_ISSUER'); // e.g., https://cognito-idp.{region}.amazonaws.com/{userPoolId}
    const audience = configService.get('COGNITO_CLIENT_ID'); // Use the App Client ID expected for admin users

    // Ensure required configurations are present before creating the client
    if (!jwksUri) {
        logger.error('[AdminGuard Setup] Missing required configuration: COGNITO_JWKS_URI');
        throw new Error('Server configuration error: Missing JWKS URI for admin authentication.');
    }
    if (!issuer) {
        logger.error('[AdminGuard Setup] Missing required configuration: COGNITO_ISSUER');
        throw new Error('Server configuration error: Missing Issuer for admin authentication.');
    }
    if (!audience) {
        logger.warn('[AdminGuard Setup] Missing configuration: COGNITO_CLIENT_ID. Audience check will be skipped if empty.');
        // Decide if this is critical. If so, throw an error like above.
        // throw new Error('Server configuration error: Missing Client ID/Audience for admin authentication.');
    }
    // --- End FIX ---


    const client: JwksClient = jwksClient({
        jwksUri: jwksUri, // Now guaranteed to be a string
        cache: true, // Enable caching
        rateLimit: true, // Enable rate limiting
        jwksRequestsPerMinute: 5, // Adjust rate limit as needed
    });

    function getKey(header: JwtHeader, callback: SigningKeyCallback): void {
        if (!header.kid) {
            // Provide a more specific error to the callback
            return callback(new Error('JWT header missing kid'));
        }
        client.getSigningKey(header.kid, (err, key) => {
            if (err) {
                // Forward the error from jwksClient
                return callback(err);
            }
            // Handle case where key might not be found (though getSigningKey usually errors)
            if (!key) {
                return callback(new Error(`Unable to find signing key for kid: ${header.kid}`));
            }
            // Depending on key type (RSA/EC), use getPublicKey() or getSecret() - check jwks-rsa docs/types if needed
            // getPublicKey is common for RSA keys used by Cognito
            try {
                const signingKey = key.getPublicKey();
                callback(null, signingKey); // Pass null for error and the key/secret
            } catch (keyError: any) {
                callback(keyError); // Pass error if getting the public key failed
            }
        });
    }
    // --- End JWKS Client Setup ---


    // Return the actual middleware function
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {

        const nodeEnv = process.env.NODE_ENV || 'development'; // Default to development if not set
        const authHeader = req.headers.authorization;
        const bypassTokenExpected = `Bearer ${TEST_ENV_BEARER_TOKEN}`;
        const requestId = req.id || 'N/A'; // Get request ID if available

        // --- Test Environment Bypass ---
        // Check NODE_ENV FIRST for clarity and performance in non-test envs
        if (nodeEnv === 'test') {
            // Use DEBUG level for test-specific logic logs
            logger.debug(`[AdminGuard - ${requestId}] Test environment detected. Checking for bypass token.`);
            if (authHeader === bypassTokenExpected) {
                logger.debug(`[AdminGuard - ${requestId}] TEST TOKEN MATCHED! Bypassing JWT validation.`);
                // Attach mock admin user
                req.adminUser = {
                    id: 'test-admin-id-123', // Use a distinct ID for tests
                    username: 'testadmin@bypass.local',
                    roles: [requiredAdminRole], // Ensure the required role is present
                    attributes: { // Minimal attributes for testing if needed
                        'cognito:groups': [requiredAdminRole],
                        sub: 'test-admin-id-123',
                        email: 'testadmin@bypass.local'
                    }
                } as AdminUser; // Cast to satisfy type, ensure required fields are present
                return next(); // Bypass JWT check and proceed
            } else {
                // Log mismatch only if in test env but token doesn't match
                logger.debug(`[AdminGuard - ${requestId}] Test environment - Bypass token MISMATCH or missing. Proceeding with standard validation.`);
                // Fall through to standard validation below (which will likely fail if no valid JWT is provided)
            }
        }
        // --- End Test Environment Bypass ---

        // logger.debug(`[AdminGuard - ${requestId}] Checking admin authentication for ${req.method} ${req.path}`); // Keep this if useful

        try {
            // const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                logger.warn(`[AdminGuard - ${requestId}] Missing or invalid Authorization header.`);
                throw new AuthenticationError('Authorization header is missing or invalid.');
            }
            const accessToken = authHeader.split(' ')[1];
            if (!accessToken) {
                logger.warn(`[AdminGuard - ${requestId}] Bearer token is missing.`);
                throw new AuthenticationError('Bearer token is missing.');
            }

            // --- Verify JWT Locally (Recommended for Admin Guard) ---
            // Type hint for the successfully decoded payload
            let decodedPayload: JwtPayload;
            try {
                // Use Promise<JwtPayload> as we'll ensure it resolves only with that type
                decodedPayload = await new Promise<JwtPayload>((resolve, reject) => {
                    jwt.verify(accessToken, getKey, {
                        audience: audience || undefined, // Pass audience only if defined, or handle missing config earlier
                        issuer: issuer, // Check if the token was issued by the correct authority
                        algorithms: ['RS256'], // Cognito uses RS256
                    }, (err: VerifyErrors | null, decoded: JwtPayload | string | undefined) => { // Add types here
                        if (err) {
                            // Specific JWT errors (like TokenExpiredError) are instances of VerifyErrors
                            logger.warn(`[AdminGuard - ${requestId}] JWT verification failed: ${err.message}`, { errorName: err.name });
                            if (err.name === 'TokenExpiredError') {
                                return reject(new TokenExpiredError('Access'));
                            }
                            // Map other jwt errors to InvalidTokenError or a more specific domain error
                            return reject(new InvalidTokenError(`JWT verification error: ${err.message}`));
                        }

                        // Ensure payload is an object (JwtPayload) and not string/undefined
                        if (typeof decoded !== 'object' || !decoded) {
                            logger.error(`[AdminGuard - ${requestId}] JWT verification resulted in unexpected payload type: ${typeof decoded}`);
                            return reject(new InvalidTokenError('Invalid token structure after verification.'));
                        }

                        // Now `decoded` is confirmed to be JwtPayload
                        resolve(decoded); // Assert type after successful verification and type check
                    });
                });
                // --- End FIX ---

                // Note: The check `if (typeof decodedPayload === 'string' || !decodedPayload)`
                // from the original code is now handled *inside* the Promise callback,
                // ensuring the promise only resolves with JwtPayload.

            } catch (error: any) {
                // Catch errors *rejected* by the promise (like TokenExpiredError, InvalidTokenError)
                // or errors during the promise setup itself (less likely here).
                // Log if it's not one of our known domain errors already logged
                if (!(error instanceof TokenExpiredError || error instanceof InvalidTokenError)) {
                    logger.error(`[AdminGuard - ${requestId}] Unexpected error during JWT verification promise: ${error.message}`, { error });
                }
                // Re-throw the caught error (could be TokenExpiredError, InvalidTokenError, etc.)
                // to be handled by the outer catch block
                throw error;
            }


            // --- Authorization Check ---
            // Extract roles/groups from the decoded token payload
            // Cognito typically puts groups in 'cognito:groups' claim
            // Access claims using bracket notation for safety as they might not exist
            const userGroups: string[] = (decodedPayload['cognito:groups'] as string[]) || []; // Assert type if confident, or add validation

            if (!userGroups.includes(requiredAdminRole)) {
                logger.warn(`[AdminGuard - ${requestId}] Authorization failed: User ${decodedPayload.sub || decodedPayload.username || 'N/A'} lacks required role '${requiredAdminRole}'.`, { userGroups });
                // Use a specific ForbiddenError or similar
                throw new BaseError('ForbiddenError', 403, `Access denied. Required role '${requiredAdminRole}' missing.`, true);
            }

            // --- Attach Admin User Context ---
            // Attach verified admin user info to the request
            req.adminUser = {
                // Use optional chaining or nullish coalescing for safety
                id: decodedPayload.sub ?? 'unknown-sub', // 'sub' is standard JWT claim for user ID
                username: (decodedPayload.username as string) ?? // Example if username is a custom claim
                    (decodedPayload['cognito:username'] as string) ?? // Example if Cognito puts it here
                    'unknown-username',
                roles: userGroups,
                attributes: decodedPayload, // Attach the full payload for potential downstream use
            };

            logger.info(`[AdminGuard - ${requestId}] Admin authentication successful for user: ${req.adminUser.username} (ID: ${req.adminUser.id})`);
            next(); // Proceed

        } catch (error) {
            // Pass errors (AuthenticationError, ForbiddenError, TokenExpiredError, InvalidTokenError etc.)
            // to the global error handler middleware
            next(error);
        }
    };
};