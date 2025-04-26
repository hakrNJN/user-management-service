import { NextFunction, Request, Response } from 'express';
import { inject, injectable } from 'tsyringe';
import { HttpStatusCode } from '../../application/enums/HttpStatusCode';
import { IGroupAdminService } from '../../application/interfaces/IGroupAdminService';
import { ILogger } from '../../application/interfaces/ILogger';
import { TYPES } from '../../shared/constants/types';
import { BaseError } from '../../shared/errors/BaseError';
import { AdminUser } from '../../shared/types/admin-user.interface'; // For type safety
import { CreateGroupAdminDto, GroupNameParamsDto } from '../dtos/create-group.admin.dto'; // Import DTOs

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

    // POST /admin/groups
    createGroup = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const adminUser = this.getAdminUser(req);
        try {
            const createDto: CreateGroupAdminDto = req.body;
            const newGroup = await this.groupAdminService.createGroup(adminUser, createDto);
            res.status(HttpStatusCode.CREATED).json(newGroup); // 201 Created
        } catch (error) {
            this.logger.error(`[GroupAdminCtrl] Failed to create group ${req.body?.groupName}`, { adminUserId: adminUser.id, error });
            next(error);
        }
    };

    // GET /admin/groups/:groupName
    getGroup = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const adminUser = this.getAdminUser(req);
        try {
            const { groupName }: GroupNameParamsDto = req.params as any;
            const group = await this.groupAdminService.getGroup(adminUser, groupName);
            if (!group) {
                res.status(HttpStatusCode.NOT_FOUND).json({ message: `Group '${groupName}' not found.` });
            } else {
                res.status(HttpStatusCode.OK).json(group);
            }
        } catch (error) {
            this.logger.error(`[GroupAdminCtrl] Failed to get group ${req.params?.groupName}`, { adminUserId: adminUser.id, error });
            next(error);
        }
    };

    // GET /admin/groups
    listGroups = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const adminUser = this.getAdminUser(req);
        try {
            // Extract pagination from query if needed
            const { limit, nextToken } = req.query;
            const limitNum = limit ? parseInt(limit as string, 10) : undefined;

            const result = await this.groupAdminService.listGroups(adminUser, limitNum, nextToken as string);
            res.status(HttpStatusCode.OK).json(result);
        } catch (error) {
            this.logger.error(`[GroupAdminCtrl] Failed to list groups`, { adminUserId: adminUser.id, error });
            next(error);
        }
    };

    // DELETE /admin/groups/:groupName
    deleteGroup = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const adminUser = this.getAdminUser(req);
        try {
            const { groupName }: GroupNameParamsDto = req.params as any;
            await this.groupAdminService.deleteGroup(adminUser, groupName);
            res.status(HttpStatusCode.NO_CONTENT).send(); // 204 No Content
        } catch (error) {
            this.logger.error(`[GroupAdminCtrl] Failed to delete group ${req.params?.groupName}`, { adminUserId: adminUser.id, error });
            next(error);
        }
    };
}
