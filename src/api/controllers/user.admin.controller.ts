import { NextFunction, Request, Response } from 'express';
import { inject, injectable } from 'tsyringe';
import { HttpStatusCode } from '../../application/enums/HttpStatusCode';
import { ILogger } from '../../application/interfaces/ILogger';
import { IUserAdminService } from '../../application/interfaces/IUserAdminService';
import { TYPES } from '../../shared/constants/types';
import { BaseError, ValidationError } from '../../shared/errors/BaseError';
// Import DTOs used by this controller
import { AdminUser } from '../../shared/types/admin-user.interface'; // For type safety
import { AddUserToGroupAdminDto, AddUserToGroupAdminParams, RemoveUserFromGroupAdminParams } from '../dtos/add-user-to-group.admin.dto';
import { CreateUserAdminDto } from '../dtos/create-user.admin.dto';
import { ListUsersQueryAdminDto } from '../dtos/list-users-query.admin.dto';
import { UpdateUserAttributesAdminDto, UpdateUserAttributesAdminParams } from '../dtos/update-user-attributes.admin.dto';

@injectable()
export class UserAdminController {
    constructor(
        @inject(TYPES.UserAdminService) private userAdminService: IUserAdminService,
        @inject(TYPES.Logger) private logger: ILogger,
    ) { }

    // Helper to get admin user context safely
    private getAdminUser(req: Request): AdminUser {
        if (!req.adminUser) {
            // This should ideally not happen if the guard runs correctly
            this.logger.error("CRITICAL: Admin user context missing after auth guard.");
            throw new BaseError('ServerError', HttpStatusCode.INTERNAL_SERVER_ERROR, 'Admin context missing.', false);
        }
        return req.adminUser;
    }

    // POST /admin/users
    createUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        let adminUser: AdminUser | undefined; // Define outside for scope in catch
        try {
            adminUser = this.getAdminUser(req); // <<< MOVE INSIDE TRY
            const createDto: CreateUserAdminDto = req.body;
            const newUser = await this.userAdminService.createUser(adminUser, createDto);
            res.status(HttpStatusCode.CREATED).json(newUser); // 201 Created
        } catch (error: any) {
            const errorName = error instanceof Error ? error.name : 'UnknownError';
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`[UserAdminCtrl] Failed to [operation name]`, {
                adminUserId: adminUser?.id, // Use optional chaining if adminUser might be undefined here
                // Add other relevant context like username/groupName if available
                targetUsername: req.params?.username||'user name not found', // Example
                errorName: errorName,
                errorMessage: errorMessage,
            });
            next(error);
        }
    };

    // GET /admin/users/:username
    getUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const adminUser = this.getAdminUser(req);
        const targetUsername = req.params?.username||'user name not found'; 
        try {
            const { username } = req.params;
            const user = await this.userAdminService.getUser(adminUser, username);
            if (!user) {
                res.status(HttpStatusCode.NOT_FOUND).json({ message: `User '${username}' not found.` });
            } else {
                res.status(HttpStatusCode.OK).json(user);
            }
        } catch (error) {
            const errorName = error instanceof Error ? error.name : 'UnknownError';
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`[UserAdminCtrl] Failed to get user ${targetUsername}`, { // Use operation name
                adminUserId: adminUser.id, // Safe to use adminUser here as getAdminUser would have thrown earlier if missing
                targetUsername: targetUsername ,
                errorName: errorName,
                errorMessage: errorMessage,
            });
            next(error);
        }
    };

    // GET /admin/users
    listUsers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        let adminUser: AdminUser | undefined;
        const targetUsername = req.params?.username||'user name not found'; 
        try {
            adminUser = this.getAdminUser(req); // <<< MOVE INSIDE TRY

            const { limit, paginationToken, filter } = req.query; // Use correct DTO names

            const queryOptions: ListUsersQueryAdminDto = {
                limit: limit ? parseInt(limit as string, 10) : undefined,
                paginationToken: paginationToken as string | undefined,
                filter: filter as string | undefined,
            };

            if (limit && isNaN(queryOptions.limit as number)) {
                throw new ValidationError('Invalid query parameter: limit must be a number.');
            }

            const result = await this.userAdminService.listUsers(adminUser, queryOptions);
            res.status(HttpStatusCode.OK).json(result);
        } catch (error) {
            const errorName = error instanceof Error ? error.name : 'UnknownError';
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`[UserAdminCtrl] Failed to List users ${targetUsername}`, { // Use operation name
                adminUserId: adminUser?.id, // Safe to use adminUser here as getAdminUser would have thrown earlier if missing
                targetUsername: targetUsername,
                errorName: errorName,
                errorMessage: errorMessage,
            });
            next(error);
        }
    };

    // PUT /admin/users/:username/attributes
    updateUserAttributes = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const adminUser = this.getAdminUser(req);
        try {
            // Assuming validation middleware typed params and body
            const { username }: UpdateUserAttributesAdminParams = req.params as any;
            const updateDto: UpdateUserAttributesAdminDto = req.body;
            await this.userAdminService.updateUserAttributes(adminUser, { username, ...updateDto });
            res.status(HttpStatusCode.NO_CONTENT).send(); // 204 No Content
        } catch (error) {
            this.logger.error(`[UserAdminCtrl] Failed to update attributes for user ${req.params?.username}`, { adminUserId: adminUser.id, error });
            next(error);
        }
    };

    // DELETE /admin/users/:username
    deleteUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const adminUser = this.getAdminUser(req);
        try {
            const { username } = req.params;
            await this.userAdminService.deleteUser(adminUser, username);
            res.status(HttpStatusCode.NO_CONTENT).send(); // 204 No Content
        } catch (error) {
            this.logger.error(`[UserAdminCtrl] Failed to delete user ${req.params?.username}`, { adminUserId: adminUser.id, error });
            next(error);
        }
    };

    // POST /admin/users/:username/disable
    disableUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const adminUser = this.getAdminUser(req);
        try {
            const { username } = req.params;
            await this.userAdminService.disableUser(adminUser, username);
            res.status(HttpStatusCode.OK).json({ message: `User ${username} disabled successfully.` });
        } catch (error) {
            this.logger.error(`[UserAdminCtrl] Failed to disable user ${req.params?.username}`, { adminUserId: adminUser.id, error });
            next(error);
        }
    };

    // POST /admin/users/:username/enable
    enableUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const adminUser = this.getAdminUser(req);
        try {
            const { username } = req.params;
            await this.userAdminService.enableUser(adminUser, username);
            res.status(HttpStatusCode.OK).json({ message: `User ${username} enabled successfully.` });
        } catch (error) {
            this.logger.error(`[UserAdminCtrl] Failed to enable user ${req.params?.username}`, { adminUserId: adminUser.id, error });
            next(error);
        }
    };

    // POST /admin/users/:username/initiate-password-reset
    initiatePasswordReset = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const adminUser = this.getAdminUser(req);
        try {
            const { username } = req.params;
            await this.userAdminService.initiatePasswordReset(adminUser, username);
            res.status(HttpStatusCode.OK).json({ message: `Password reset initiated for user ${username}.` });
        } catch (error) {
            this.logger.error(`[UserAdminCtrl] Failed to initiate password reset for user ${req.params?.username}`, { adminUserId: adminUser.id, error });
            next(error);
        }
    };

    // POST /admin/users/:username/set-password
    setUserPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const adminUser = this.getAdminUser(req);
        try {
            const { username } = req.params;
            const { password, permanent = false } = req.body; // Get password from body
            if (!password) throw new ValidationError('Password is required in the request body.');
            await this.userAdminService.setUserPassword(adminUser, username, password, permanent);
            res.status(HttpStatusCode.OK).json({ message: `Password set successfully for user ${username}.` });
        } catch (error) {
            this.logger.error(`[UserAdminCtrl] Failed to set password for user ${req.params?.username}`, { adminUserId: adminUser.id, error });
            next(error);
        }
    };

    // --- User Group Management ---

    // POST /admin/users/:username/groups
    addUserToGroup = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const adminUser = this.getAdminUser(req);
        try {
            const { username }: AddUserToGroupAdminParams = req.params as any;
            const { groupName }: AddUserToGroupAdminDto = req.body;
            await this.userAdminService.addUserToGroup(adminUser, username, groupName);
            res.status(HttpStatusCode.OK).json({ message: `User ${username} added to group ${groupName}.` });
        } catch (error) {
            this.logger.error(`[UserAdminCtrl] Failed to add user ${req.params?.username} to group ${req.body?.groupName}`, { adminUserId: adminUser.id, error });
            next(error);
        }
    };

    // DELETE /admin/users/:username/groups/:groupName
    removeUserFromGroup = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const adminUser = this.getAdminUser(req);
        try {
            const { username, groupName }: RemoveUserFromGroupAdminParams = req.params as any;
            await this.userAdminService.removeUserFromGroup(adminUser, username, groupName);
            res.status(HttpStatusCode.NO_CONTENT).send();
        } catch (error) {
            this.logger.error(`[UserAdminCtrl] Failed to remove user ${req.params?.username} from group ${req.params?.groupName}`, { adminUserId: adminUser.id, error });
            next(error);
        }
    };

    // GET /admin/users/:username/groups
    listGroupsForUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const adminUser = this.getAdminUser(req);
        try {
            const { username } = req.params;
            // Extract pagination from query if needed
            const { limit, nextToken } = req.query;
            const limitNum = limit ? parseInt(limit as string, 10) : undefined;

            const result = await this.userAdminService.listGroupsForUser(adminUser, username, limitNum, nextToken as string);
            res.status(HttpStatusCode.OK).json(result);
        } catch (error) {
            this.logger.error(`[UserAdminCtrl] Failed to list groups for user ${req.params?.username}`, { adminUserId: adminUser.id, error });
            next(error);
        }
    };

    // GET /admin/groups/:groupName/users
    listUsersInGroup = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const adminUser = this.getAdminUser(req);
        try {
            const { groupName } = req.params;
            // Extract pagination from query if needed
            const { limit, nextToken } = req.query;
            const limitNum = limit ? parseInt(limit as string, 10) : undefined;

            const result = await this.userAdminService.listUsersInGroup(adminUser, groupName, limitNum, nextToken as string);
            res.status(HttpStatusCode.OK).json(result);
        } catch (error) {
            this.logger.error(`[UserAdminCtrl] Failed to list users in group ${req.params?.groupName}`, { adminUserId: adminUser.id, error });
            next(error);
        }
    };
}
