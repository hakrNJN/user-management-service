import { NextFunction, Request, Response } from 'express';
import { inject, injectable } from 'tsyringe';
import { HttpStatusCode } from '../../application/enums/HttpStatusCode';
import { ILogger } from '../../application/interfaces/ILogger';
import { IPermissionAdminService } from '../../application/interfaces/IPermissionAdminService';
import { TYPES } from '../../shared/constants/types';
import { BaseError } from '../../shared/errors/BaseError';
import { AdminUser } from '../../shared/types/admin-user.interface';
// Import DTOs
import { PermissionNotFoundError } from '../../domain/exceptions/UserManagementError';
import { CreatePermissionAdminDto, PermissionNameParamsDto, UpdatePermissionAdminDto } from '../dtos/role-permission.admin.dto';

@injectable()
export class PermissionAdminController {
    constructor(
        @inject(TYPES.PermissionAdminService) private permissionAdminService: IPermissionAdminService,
        @inject(TYPES.Logger) private logger: ILogger,
    ) {}

     private getAdminUser(req: Request): AdminUser {
        if (!req.adminUser) throw new BaseError('ServerError', HttpStatusCode.INTERNAL_SERVER_ERROR, 'Admin context missing.', false);
        return req.adminUser;
    }

    // POST /admin/permissions
    createPermission = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const adminUser = this.getAdminUser(req);
        try {
            const createDto: CreatePermissionAdminDto = req.body;
            const newPermission = await this.permissionAdminService.createPermission(adminUser, createDto);
            res.status(HttpStatusCode.CREATED).json(newPermission);
        } catch (error) {
            this.logger.error(`[PermAdminCtrl] Failed to create permission ${req.body?.permissionName}`, { adminUserId: adminUser.id, error });
            next(error);
        }
    };

    // GET /admin/permissions/:permissionName
    getPermission = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const adminUser = this.getAdminUser(req);
        const permissionNameFromParams = req.params?.permissionName;
        try {
            const { permissionName }: PermissionNameParamsDto = req.params as any;
            const permission = await this.permissionAdminService.getPermission(adminUser, permissionName);
            if (!permission) {
                // Use next() with specific error for consistent handling by error middleware
               throw new PermissionNotFoundError(permissionName);
           } else {
               res.status(HttpStatusCode.OK).json(permission);
           }
        } catch (error) {
            if (!(error instanceof PermissionNotFoundError)) {
                this.logger.error(`[PermAdminCtrl] Failed to get permission ${permissionNameFromParams}`, { adminUserId: adminUser.id, error });
            }
             next(error);
        }
    };

     // GET /admin/permissions
    listPermissions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
         const adminUser = this.getAdminUser(req);
         try {
            const { limit, startKey } = req.query;
            const limitNum = limit ? parseInt(limit as string, 10) : undefined;
            const options = { limit: limitNum, startKey: startKey ? JSON.parse(startKey as string) : undefined };

            const result = await this.permissionAdminService.listPermissions(adminUser, options);
            res.status(HttpStatusCode.OK).json(result);
        } catch (error) {
             this.logger.error(`[PermAdminCtrl] Failed to list permissions`, { adminUserId: adminUser.id, error });
             next(error);
        }
    };

     // PUT /admin/permissions/:permissionName
    updatePermission = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
         const adminUser = this.getAdminUser(req);
         try {
            const { permissionName }: PermissionNameParamsDto = req.params as any;
            const updateDto: UpdatePermissionAdminDto = req.body;
            const updatedPermission = await this.permissionAdminService.updatePermission(adminUser, permissionName, updateDto);
             if (!updatedPermission) {
                res.status(HttpStatusCode.NOT_FOUND).json({ message: `Permission '${permissionName}' not found for update.` });
            } else {
                res.status(HttpStatusCode.OK).json(updatedPermission);
            }
        } catch (error) {
             this.logger.error(`[PermAdminCtrl] Failed to update permission ${req.params?.permissionName}`, { adminUserId: adminUser.id, error });
             next(error);
        }
    };

      // DELETE /admin/permissions/:permissionName
     deletePermission = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
         const adminUser = this.getAdminUser(req);
         try {
            const { permissionName }: PermissionNameParamsDto = req.params as any;
            await this.permissionAdminService.deletePermission(adminUser, permissionName);
            res.status(HttpStatusCode.NO_CONTENT).send();
        } catch (error) {
             this.logger.error(`[PermAdminCtrl] Failed to delete permission ${req.params?.permissionName}`, { adminUserId: adminUser.id, error });
             next(error);
        }
    };

    // GET /admin/permissions/:permissionName/roles
    listRolesForPermission = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const adminUser = this.getAdminUser(req);
        try {
            const { permissionName }: PermissionNameParamsDto = req.params as any;
            const roles = await this.permissionAdminService.listRolesForPermission(adminUser, permissionName);
            res.status(HttpStatusCode.OK).json({ roles });
        } catch (error) {
             this.logger.error(`[PermAdminCtrl] Failed to list roles for permission ${req.params?.permissionName}`, { adminUserId: adminUser.id, error });
             next(error);
        }
    };
}
