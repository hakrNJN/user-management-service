import {
    AdminAddUserToGroupCommand,
    AdminCreateUserCommand,
    AdminDeleteUserCommand,
    AdminDisableUserCommand,
    AdminEnableUserCommand,
    AdminGetUserCommand,
    AdminGetUserCommandOutput,
    AdminListGroupsForUserCommand,
    AdminRemoveUserFromGroupCommand,
    AdminResetUserPasswordCommand,
    AdminSetUserPasswordCommand,
    AdminUpdateUserAttributesCommand,
    // Types
    AttributeType,
    CognitoIdentityProviderClient,
    CreateGroupCommand,
    DeleteGroupCommand,
    GetGroupCommand,
    GroupExistsException,
    GroupType,
    InternalErrorException,
    InvalidParameterException,
    InvalidPasswordException,
    LimitExceededException,
    ListGroupsCommand,
    ListUsersCommand,
    ListUsersInGroupCommand,
    NotAuthorizedException,
    ResourceNotFoundException,
    TooManyRequestsException,
    // Exceptions (Import necessary ones for handleCognitoError)
    UserNotFoundException,
    UserType,
    UsernameExistsException
} from "@aws-sdk/client-cognito-identity-provider";
import { inject, injectable } from 'tsyringe';
import { HttpStatusCode } from '../../../application/enums/HttpStatusCode'; // Assuming defined
import { IConfigService } from '../../../application/interfaces/IConfigService';
import { ILogger } from '../../../application/interfaces/ILogger';
import {
    AdminCreateUserDetails, AdminUpdateUserAttributesDetails, CreateGroupDetails,
    IUserMgmtAdapter, ListUsersOptions, ListUsersResult
} from '../../../application/interfaces/IUserMgmtAdapter';
import { GroupExistsError, UserNotFoundError } from '../../../domain/exceptions/UserManagementError'; // Import domain errors
import { TYPES } from '../../../shared/constants/types';
import { BaseError, NotFoundError, ValidationError } from '../../../shared/errors/BaseError';
import { applyCircuitBreaker } from '../../resilience/applyResilience';



@injectable()
export class CognitoUserMgmtAdapter implements IUserMgmtAdapter {
    private cognitoClient: CognitoIdentityProviderClient;
    private userPoolId: string;
    private circuitBreakerKey: string = 'cognitoAdmin'; // Use a specific key for admin operations

    constructor(
        @inject(TYPES.ConfigService) private configService: IConfigService,
        @inject(TYPES.Logger) private logger: ILogger
    ) {
        const region = this.configService.getOrThrow('AWS_REGION');
        this.userPoolId = this.configService.getOrThrow('COGNITO_USER_POOL_ID');
        this.cognitoClient = new CognitoIdentityProviderClient({ region });
        this.logger.info('CognitoUserMgmtAdapter initialized', { region, userPoolId: this.userPoolId });
        // Ensure 'cognitoAdmin' options exist in circuit-breaker.config.ts or adjust key
    }

    // --- Error Handling Helper ---
    private handleCognitoAdminError(error: any, operationName: string): Error {
        this.logger.error(`Cognito Admin error during ${operationName}`, { errorName: error?.name, errorMessage: error?.message, stack: error?.stack });

        if (error.name === 'OpenCircuitError') {
            this.logger.warn(`Circuit breaker is open for admin operation: ${operationName}`);
            return new BaseError('ServiceUnavailableError', HttpStatusCode.SERVICE_UNAVAILABLE, `The admin service (${operationName}) is temporarily unavailable.`, true);
        }

        // Map specific Cognito Admin exceptions
        if (error instanceof UserNotFoundException || error.name === 'UserNotFoundException') {
            return new UserNotFoundError(`Operation: ${operationName}`); // Use specific domain error
        }
        if (error instanceof ResourceNotFoundException || error.name === 'ResourceNotFoundException') {
            // Could be user or group not found depending on context
            return new NotFoundError(`Operation: ${operationName}. Resource (User or Group)`);
        }
        if (error instanceof GroupExistsException || error.name === 'GroupExistsException') {
            return new GroupExistsError(`Operation: ${operationName}. Group`); // Use specific domain error
        }
        if (error instanceof UsernameExistsException || error.name === 'UsernameExistsException') {
            return new ValidationError(`Operation: ${operationName}. Username already exists.`);
        }
        if (error instanceof InvalidPasswordException || error.name === 'InvalidPasswordException') {
            return new ValidationError(`Operation: ${operationName}. ${error.message || 'Password does not meet requirements.'}`);
        }
        if (error instanceof InvalidParameterException || error.name === 'InvalidParameterException') {
            return new ValidationError(`Operation: ${operationName}. Invalid parameters. ${error.message}`);
        }
        if (error instanceof LimitExceededException || error.name === 'LimitExceededException' || error instanceof TooManyRequestsException || error.name === 'TooManyRequestsException') {
            return new BaseError('RateLimitError', HttpStatusCode.TOO_MANY_REQUESTS, `${operationName} failed: Request limit exceeded.`, true);
        }
        if (error instanceof NotAuthorizedException || error.name === 'NotAuthorizedException') {
            // This usually indicates the calling credentials (service IAM role) lack permissions
            this.logger.error(`CRITICAL: Not Authorized for Cognito Admin operation ${operationName}. Check IAM Permissions!`);
            return new BaseError('AuthorizationError', HttpStatusCode.FORBIDDEN, `Not authorized to perform admin operation: ${operationName}. Check service permissions.`, false);
        }
        if (error instanceof InternalErrorException || error.name === 'InternalErrorException') {
            return new BaseError('IdPInternalError', HttpStatusCode.INTERNAL_SERVER_ERROR, `Cognito internal error during ${operationName}.`, false);
        }
        // Add more mappings as needed...

        // Fallback
        const message = error instanceof Error ? error.message : 'An unknown error occurred.';
        return new BaseError('CognitoAdminInteractionError', HttpStatusCode.INTERNAL_SERVER_ERROR, `${operationName} failed: ${message}`, false);
    }

    // --- User Operations ---

    async adminCreateUser(details: AdminCreateUserDetails): Promise<UserType> {
        const operationName = 'adminCreateUser';
        const attributes: AttributeType[] = Object.entries(details.userAttributes).map(([Name, Value]) => ({ Name, Value }));
        const command = new AdminCreateUserCommand({
            UserPoolId: this.userPoolId,
            Username: details.username,
            TemporaryPassword: details.temporaryPassword,
            UserAttributes: attributes,
            MessageAction: details.suppressWelcomeMessage ? 'SUPPRESS' : undefined, // Default is RESEND
            ForceAliasCreation: details.forceAliasCreation,
            DesiredDeliveryMediums: details.userAttributes.email ? ['EMAIL'] : (details.userAttributes.phone_number ? ['SMS'] : undefined),
        });
        try {
            const resilientOp = applyCircuitBreaker(() => this.cognitoClient.send(command), this.circuitBreakerKey, this.logger);
            const response = await resilientOp();
            if (!response.User) throw new Error('Cognito did not return user details after creation.');
            this.logger.info(`Admin successfully created user: ${details.username}`);
            return response.User;
        } catch (error: any) {
            throw this.handleCognitoAdminError(error, operationName);
        }
    }

    async adminGetUser(username: string): Promise<UserType | null> {
        const operationName = 'adminGetUser';
        const command = new AdminGetUserCommand({ UserPoolId: this.userPoolId, Username: username });
        try {
            const resilientOp = applyCircuitBreaker(() => this.cognitoClient.send(command), this.circuitBreakerKey, this.logger);
            // AdminGetUser returns the full user object directly
            const response: AdminGetUserCommandOutput = await resilientOp();
            // Map attributes if needed, but returning UserType aligns with interface
            const user: UserType = {
                Username: response.Username,
                Attributes: response.UserAttributes,
                UserCreateDate: response.UserCreateDate,
                UserLastModifiedDate: response.UserLastModifiedDate,
                Enabled: response.Enabled,
                UserStatus: response.UserStatus,
                MFAOptions: response.MFAOptions,
            };
            this.logger.debug(`Admin successfully retrieved user: ${username}`);
            return user;
        } catch (error: any) {
            // Handle UserNotFoundException specifically to return null
            if (error instanceof UserNotFoundException || error.name === 'UserNotFoundException') {
                this.logger.debug(`${operationName} - User not found: ${username}`);
                return null;
            }
            throw this.handleCognitoAdminError(error, operationName);
        }
    }

    async adminUpdateUserAttributes(details: AdminUpdateUserAttributesDetails): Promise<void> {
        const operationName = 'adminUpdateUserAttributes';
        const attributes: AttributeType[] = Object.entries(details.attributesToUpdate).map(([Name, Value]) => ({ Name, Value }));
        // Note: AdminUpdateUserAttributes replaces all attributes specified. To delete, you'd need separate logic or ensure the IdP supports empty values for deletion.
        const command = new AdminUpdateUserAttributesCommand({
            UserPoolId: this.userPoolId,
            Username: details.username,
            UserAttributes: attributes,
        });
        try {
            const resilientOp = applyCircuitBreaker(() => this.cognitoClient.send(command), this.circuitBreakerKey, this.logger);
            await resilientOp();
            this.logger.info(`Admin successfully updated attributes for user: ${details.username}`);
        } catch (error: any) {
            throw this.handleCognitoAdminError(error, operationName);
        }
    }

    async adminDeleteUser(username: string): Promise<void> {
        const operationName = 'adminDeleteUser';
        const command = new AdminDeleteUserCommand({ UserPoolId: this.userPoolId, Username: username });
        try {
            const resilientOp = applyCircuitBreaker(() => this.cognitoClient.send(command), this.circuitBreakerKey, this.logger);
            await resilientOp();
            this.logger.info(`Admin successfully deleted user: ${username}`);
        } catch (error: any) {
            throw this.handleCognitoAdminError(error, operationName);
        }
    }

    async adminDisableUser(username: string): Promise<void> {
        const operationName = 'adminDisableUser';
        const command = new AdminDisableUserCommand({ UserPoolId: this.userPoolId, Username: username });
        try {
            const resilientOp = applyCircuitBreaker(() => this.cognitoClient.send(command), this.circuitBreakerKey, this.logger);
            await resilientOp();
            this.logger.info(`Admin successfully disabled user: ${username}`);
        } catch (error: any) {
            throw this.handleCognitoAdminError(error, operationName);
        }
    }

    async adminEnableUser(username: string): Promise<void> {
        const operationName = 'adminEnableUser';
        const command = new AdminEnableUserCommand({ UserPoolId: this.userPoolId, Username: username });
        try {
            const resilientOp = applyCircuitBreaker(() => this.cognitoClient.send(command), this.circuitBreakerKey, this.logger);
            await resilientOp();
            this.logger.info(`Admin successfully enabled user: ${username}`);
        } catch (error: any) {
            throw this.handleCognitoAdminError(error, operationName);
        }
    }

    async adminInitiatePasswordReset(username: string): Promise<void> {
        const operationName = 'adminInitiatePasswordReset';
        const command = new AdminResetUserPasswordCommand({ UserPoolId: this.userPoolId, Username: username });
        try {
            const resilientOp = applyCircuitBreaker(() => this.cognitoClient.send(command), this.circuitBreakerKey, this.logger);
            await resilientOp();
            this.logger.info(`Admin successfully initiated password reset for user: ${username}`);
        } catch (error: any) {
            throw this.handleCognitoAdminError(error, operationName);
        }
    }

    async adminSetUserPassword(username: string, password: string, permanent: boolean): Promise<void> {
        const operationName = 'adminSetUserPassword';
        const command = new AdminSetUserPasswordCommand({
            UserPoolId: this.userPoolId,
            Username: username,
            Password: password,
            Permanent: permanent,
        });
        try {
            const resilientOp = applyCircuitBreaker(() => this.cognitoClient.send(command), this.circuitBreakerKey, this.logger);
            await resilientOp();
            this.logger.info(`Admin successfully set password for user: ${username}`);
        } catch (error: any) {
            throw this.handleCognitoAdminError(error, operationName);
        }
    }

    async adminAddUserToGroup(username: string, groupName: string): Promise<void> {
        const operationName = 'adminAddUserToGroup';
        const command = new AdminAddUserToGroupCommand({ UserPoolId: this.userPoolId, Username: username, GroupName: groupName });
        try {
            const resilientOp = applyCircuitBreaker(() => this.cognitoClient.send(command), this.circuitBreakerKey, this.logger);
            await resilientOp();
            this.logger.info(`Admin successfully added user ${username} to group ${groupName}`);
        } catch (error: any) {
            // UserAlreadyInGroupException doesn't seem standard, handle based on message? Or catch in service layer.
            throw this.handleCognitoAdminError(error, operationName);
        }
    }

    async adminRemoveUserFromGroup(username: string, groupName: string): Promise<void> {
        const operationName = 'adminRemoveUserFromGroup';
        const command = new AdminRemoveUserFromGroupCommand({ UserPoolId: this.userPoolId, Username: username, GroupName: groupName });
        try {
            const resilientOp = applyCircuitBreaker(() => this.cognitoClient.send(command), this.circuitBreakerKey, this.logger);
            await resilientOp();
            this.logger.info(`Admin successfully removed user ${username} from group ${groupName}`);
        } catch (error: any) {
            throw this.handleCognitoAdminError(error, operationName);
        }
    }

    async adminListGroupsForUser(username: string, limit?: number, nextToken?: string): Promise<{ groups: GroupType[], nextToken?: string }> {
        const operationName = 'adminListGroupsForUser';
        const command = new AdminListGroupsForUserCommand({ UserPoolId: this.userPoolId, Username: username, Limit: limit, NextToken: nextToken });
        try {
            const resilientOp = applyCircuitBreaker(() => this.cognitoClient.send(command), this.circuitBreakerKey, this.logger);
            const response = await resilientOp();
            this.logger.debug(`Admin successfully listed groups for user ${username}`);
            return { groups: response.Groups || [], nextToken: response.NextToken };
        } catch (error: any) {
            throw this.handleCognitoAdminError(error, operationName);
        }
    }

    async adminListUsers(options: ListUsersOptions): Promise<ListUsersResult> {
        const operationName = 'adminListUsers';
        const command = new ListUsersCommand({
            UserPoolId: this.userPoolId,
            Limit: options.limit,
            PaginationToken: options.paginationToken,
            Filter: options.filter,
            // AttributesToGet: [...] // Optionally specify attributes to reduce payload size
        });
        try {
            const resilientOp = applyCircuitBreaker(() => this.cognitoClient.send(command), this.circuitBreakerKey, this.logger);
            const response = await resilientOp();
            this.logger.debug(`Admin successfully listed users`);
            return { users: response.Users || [], paginationToken: response.PaginationToken };
        } catch (error: any) {
            throw this.handleCognitoAdminError(error, operationName);
        }
    }

    async adminListUsersInGroup(groupName: string, limit?: number, nextToken?: string): Promise<{ users: UserType[], nextToken?: string }> {
        const operationName = 'adminListUsersInGroup';
        const command = new ListUsersInGroupCommand({ UserPoolId: this.userPoolId, GroupName: groupName, Limit: limit, NextToken: nextToken });
        try {
            const resilientOp = applyCircuitBreaker(() => this.cognitoClient.send(command), this.circuitBreakerKey, this.logger);
            const response = await resilientOp();
            this.logger.debug(`Admin successfully listed users in group ${groupName}`);
            return { users: response.Users || [], nextToken: response.NextToken };
        } catch (error: any) {
            throw this.handleCognitoAdminError(error, operationName);
        }
    }

    // --- Group Operations ---

    async adminCreateGroup(details: CreateGroupDetails): Promise<GroupType> {
        const operationName = 'adminCreateGroup';
        const command = new CreateGroupCommand({
            UserPoolId: this.userPoolId,
            GroupName: details.groupName,
            Description: details.description,
            Precedence: details.precedence,
            // RoleArn: details.roleArn,
        });
        try {
            const resilientOp = applyCircuitBreaker(() => this.cognitoClient.send(command), this.circuitBreakerKey, this.logger);
            const response = await resilientOp();
            if (!response.Group) throw new Error('Cognito did not return group details after creation.');
            this.logger.info(`Admin successfully created group: ${details.groupName}`);
            return response.Group;
        } catch (error: any) {
            throw this.handleCognitoAdminError(error, operationName);
        }
    }

    async adminDeleteGroup(groupName: string): Promise<void> {
        const operationName = 'adminDeleteGroup';
        const command = new DeleteGroupCommand({ UserPoolId: this.userPoolId, GroupName: groupName });
        try {
            const resilientOp = applyCircuitBreaker(() => this.cognitoClient.send(command), this.circuitBreakerKey, this.logger);
            await resilientOp();
            this.logger.info(`Admin successfully deleted group: ${groupName}`);
        } catch (error: any) {
            throw this.handleCognitoAdminError(error, operationName);
        }
    }

    async adminGetGroup(groupName: string): Promise<GroupType | null> {
        const operationName = 'adminGetGroup';
        const command = new GetGroupCommand({ UserPoolId: this.userPoolId, GroupName: groupName });
        try {
            const resilientOp = applyCircuitBreaker(() => this.cognitoClient.send(command), this.circuitBreakerKey, this.logger);
            const response = await resilientOp();
            if (!response.Group) {
                // Should not happen if no error, but check anyway
                this.logger.warn(`${operationName} - Cognito returned success but no group object for ${groupName}`);
                return null;
            }
            this.logger.debug(`Admin successfully retrieved group: ${groupName}`);
            return response.Group;
        } catch (error: any) {
            // Handle ResourceNotFoundException specifically to return null
            if (error instanceof ResourceNotFoundException || error.name === 'ResourceNotFoundException') {
                this.logger.debug(`${operationName} - Group not found: ${groupName}`);
                return null;
            }
            throw this.handleCognitoAdminError(error, operationName);
        }
    }

    async adminListGroups(limit?: number, nextToken?: string): Promise<{ groups: GroupType[], nextToken?: string }> {
        const operationName = 'adminListGroups';
        const command = new ListGroupsCommand({ UserPoolId: this.userPoolId, Limit: limit, NextToken: nextToken });
        try {
            const resilientOp = applyCircuitBreaker(() => this.cognitoClient.send(command), this.circuitBreakerKey, this.logger);
            const response = await resilientOp();
            this.logger.debug(`Admin successfully listed groups`);
            return { groups: response.Groups || [], nextToken: response.NextToken };
        } catch (error: any) {
            throw this.handleCognitoAdminError(error, operationName);
        }
    }
}
