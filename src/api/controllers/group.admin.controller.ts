import { NextFunction, Request, Response } from 'express';
import { inject, injectable } from 'tsyringe';
import { HttpStatusCode } from '../../application/enums/HttpStatusCode';
import { IGroupAdminService } from '../../application/interfaces/IGroupAdminService';
import { ILogger } from '../../application/interfaces/ILogger';
import { TYPES } from '../../shared/constants/types';
import { BaseError } from '../../shared/errors/BaseError';
import { AdminUser } from '../../shared/types/admin-user.interface'; // For type safety
import { CreateGroupAdminDto, GroupNameParamsDto } from '../dtos/create-group.admin.dto'; // Import DTOs
import { GroupRoleAssignDto, GroupRoleAssignParams, GroupRoleUnassignParams } from '../dtos/role-permission.admin.dto';

@injectable()
export class GroupAdminController {
    constructor(
        @inject(TYPES.GroupAdminService) private groupAdminService: IGroupAdminService,
        @inject(TYPES.Logger) private logger: ILogger,
    ) { }

    // Helper to get admin user context safely
    private getAdminUser(req: Request): AdminUser {
        if (!req.adminUser) {
            this.logger.error("CRITICAL: Admin user context missing after auth guard.");
            throw new BaseError('ServerError', HttpStatusCode.INTERNAL_SERVER_ERROR, 'Admin context missing.', false);
        }
        return req.adminUser;
    }

    createGroup = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const adminUser = this.getAdminUser(req);
        const groupNameFromBody = req.body?.groupName; // For logging context on failure
        try {
            const createDto: CreateGroupAdminDto = req.body;
            const newGroup = await this.groupAdminService.createGroup(adminUser, createDto);
            res.status(HttpStatusCode.CREATED).json(newGroup);
        } catch (error) {
            this.logger.error(`[GroupAdminCtrl] Failed to create group ${groupNameFromBody}`, { adminUserId: adminUser.id, error });
            next(error);
        }
    };

    getGroup = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const adminUser = this.getAdminUser(req);
        const groupNameFromParams = req.params?.groupName; // For logging context
        try {
            // Assume validation middleware ran, cast params
            const { groupName } = req.params as GroupNameParamsDto;
            const group = await this.groupAdminService.getGroup(adminUser, groupName);
            if (!group) {
                // Let error middleware handle 404 for consistency
                return next(new BaseError('NotFoundError', HttpStatusCode.NOT_FOUND, `Group '${groupName}' not found.`, true));
                // Or send direct response:
                // res.status(HttpStatusCode.NOT_FOUND).json({ message: `Group '${groupName}' not found.` });
            } else {
                res.status(HttpStatusCode.OK).json(group);
            }
        } catch (error) {
            this.logger.error(`[GroupAdminCtrl] Failed to get group ${groupNameFromParams}`, { adminUserId: adminUser.id, error });
            next(error);
        }
    };

    listGroups = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const adminUser = this.getAdminUser(req);
        try {
            const { limit, nextToken } = req.query;
            const limitNum = limit ? parseInt(limit as string, 10) : undefined;
            // TODO: Add validation for limit if needed

            const nextTokenStr = typeof nextToken === 'string' ? nextToken : undefined;
            const result = await this.groupAdminService.listGroups(adminUser, limitNum, nextTokenStr);
            res.status(HttpStatusCode.OK).json(result);
        } catch (error) {
            this.logger.error(`[GroupAdminCtrl] Failed to list groups`, { adminUserId: adminUser.id, error });
            next(error);
        }
    };

    deleteGroup = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const adminUser = this.getAdminUser(req);
        const groupNameFromParams = req.params?.groupName;
        try {
            const { groupName } = req.params as GroupNameParamsDto;
            await this.groupAdminService.deleteGroup(adminUser, groupName);
            res.status(HttpStatusCode.NO_CONTENT).send();
        } catch (error) {
            this.logger.error(`[GroupAdminCtrl] Failed to delete group ${groupNameFromParams}`, { adminUserId: adminUser.id, error });
            next(error);
        }
    };

    reactivateGroup = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const adminUser = this.getAdminUser(req);
        const groupNameFromParams = req.params?.groupName;
        try {
            const { groupName } = req.params as GroupNameParamsDto;
            await this.groupAdminService.reactivateGroup(adminUser, groupName);
            res.status(HttpStatusCode.OK).json({ message: `Group ${groupName} reactivated successfully.` });
        } catch (error) {
            this.logger.error(`[GroupAdminCtrl] Failed to reactivate group ${groupNameFromParams}`, { adminUserId: adminUser.id, error });
            next(error);
        }
    };

    assignRoleToGroup = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const adminUser = this.getAdminUser(req);
        const groupNameFromParams = req.params?.groupName;
        const roleNameFromBody = req.body?.roleName;
        try {
            const { groupName } = req.params as GroupRoleAssignParams; // DTO might define params and body separately
            const { roleName } = req.body as GroupRoleAssignDto;
            await this.groupAdminService.assignRoleToGroup(adminUser, groupName, roleName);
            res.status(HttpStatusCode.OK).json({ message: `Role '${roleName}' assigned to group '${groupName}'.` });
        } catch (error) {
            this.logger.error(`[GroupAdminCtrl] Failed to assign role ${roleNameFromBody} to group ${groupNameFromParams}`, { adminUserId: adminUser.id, error });
            next(error);
        }
    };

    removeRoleFromGroup = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const adminUser = this.getAdminUser(req);
        const groupNameFromParams = req.params?.groupName;
        const roleNameFromParams = req.params?.roleName;
        try {
            const { groupName, roleName } = req.params as GroupRoleUnassignParams;
            await this.groupAdminService.removeRoleFromGroup(adminUser, groupName, roleName);
            res.status(HttpStatusCode.NO_CONTENT).send();
        } catch (error) {
            this.logger.error(`[GroupAdminCtrl] Failed to remove role ${roleNameFromParams} from group ${groupNameFromParams}`, { adminUserId: adminUser.id, error });
            next(error);
        }
    };

    listRolesForGroup = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const adminUser = this.getAdminUser(req);
        const groupNameFromParams = req.params?.groupName;
        try {
            const { groupName } = req.params as GroupNameParamsDto; // Reuse group name param DTO
            const roles = await this.groupAdminService.listRolesForGroup(adminUser, groupName);
            res.status(HttpStatusCode.OK).json({ roles }); // Return list of role names
        } catch (error) {
             this.logger.error(`[GroupAdminCtrl] Failed to list roles for group ${groupNameFromParams}`, { adminUserId: adminUser.id, error });
             next(error);
        }
    };
}
