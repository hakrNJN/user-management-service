import { NextFunction, Request, Response } from 'express';
import { inject, injectable } from 'tsyringe';
import { HttpStatusCode } from '../../application/enums/HttpStatusCode';
import { ILogger } from '../../application/interfaces/ILogger';
import { IRoleAdminService } from '../../application/interfaces/IRoleAdminService';
import { TYPES } from '../../shared/constants/types';
import { BaseError } from '../../shared/errors/BaseError';
import { AdminUser } from '../../shared/types/admin-user.interface';
// Import DTOs
import { RoleNotFoundError } from '../../domain/exceptions/UserManagementError';
import { CreateRoleAdminDto, RoleNameParamsDto, RolePermissionAssignDto, RolePermissionUnassignParams, UpdateRoleAdminDto } from '../dtos/role-permission.admin.dto';

@injectable()
export class RoleAdminController {
    constructor(
        @inject(TYPES.RoleAdminService) private roleAdminService: IRoleAdminService,
        @inject(TYPES.Logger) private logger: ILogger,
    ) {}

    private getAdminUser(req: Request): AdminUser {
        if (!req.adminUser) throw new BaseError('ServerError', HttpStatusCode.INTERNAL_SERVER_ERROR, 'Admin context missing.', false);
        return req.adminUser;
    }

    // POST /admin/roles
    createRole = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const adminUser = this.getAdminUser(req);
        try {
            const createDto: CreateRoleAdminDto = req.body;
            const newRole = await this.roleAdminService.createRole(adminUser, createDto);
            res.status(HttpStatusCode.CREATED).json(newRole);
        } catch (error) {
            this.logger.error(`[RoleAdminCtrl] Failed to create role ${req.body?.roleName}`, { adminUserId: adminUser.id, error });
            next(error);
        }
    };

    // GET /admin/roles/:roleName
    getRole = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const adminUser = this.getAdminUser(req);
        const roleNameFromParams = req.params?.roleName; 
        try {
            const { roleName }: RoleNameParamsDto = req.params as any;
            const role = await this.roleAdminService.getRole(adminUser, roleName);
            if (!role) {
                // Use next() with specific error for consistent handling by error middleware
                throw new RoleNotFoundError(roleName);
            } else {
                res.status(HttpStatusCode.OK).json(role);
            }
        } catch (error) {
            if (!(error instanceof RoleNotFoundError)) {
                this.logger.error(`[RoleAdminCtrl] Failed to get role ${roleNameFromParams}`, { adminUserId: adminUser.id, error });
            }
             next(error);
        }
    };

    // GET /admin/roles
    listRoles = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
         const adminUser = this.getAdminUser(req);
         try {
            const { limit, startKey } = req.query; // Assuming QueryOptions structure
            const limitNum = limit ? parseInt(limit as string, 10) : undefined;
            const options = { limit: limitNum, startKey: startKey ? JSON.parse(startKey as string) : undefined }; // Parse startKey if needed

            const result = await this.roleAdminService.listRoles(adminUser, options);
            res.status(HttpStatusCode.OK).json(result);
        } catch (error) {
             this.logger.error(`[RoleAdminCtrl] Failed to list roles`, { adminUserId: adminUser.id, error });
             next(error);
        }
    };

    // PUT /admin/roles/:roleName
    updateRole = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
         const adminUser = this.getAdminUser(req);
         try {
            const { roleName }: RoleNameParamsDto = req.params as any;
            const updateDto: UpdateRoleAdminDto = req.body;
            const updatedRole = await this.roleAdminService.updateRole(adminUser, roleName, updateDto);
             if (!updatedRole) {
                res.status(HttpStatusCode.NOT_FOUND).json({ message: `Role '${roleName}' not found for update.` });
            } else {
                res.status(HttpStatusCode.OK).json(updatedRole);
            }
        } catch (error) {
             this.logger.error(`[RoleAdminCtrl] Failed to update role ${req.params?.roleName}`, { adminUserId: adminUser.id, error });
             next(error);
        }
    };

     // DELETE /admin/roles/:roleName
     deleteRole = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
         const adminUser = this.getAdminUser(req);
         try {
            const { roleName }: RoleNameParamsDto = req.params as any;
            await this.roleAdminService.deleteRole(adminUser, roleName);
            res.status(HttpStatusCode.NO_CONTENT).send();
        } catch (error) {
             this.logger.error(`[RoleAdminCtrl] Failed to delete role ${req.params?.roleName}`, { adminUserId: adminUser.id, error });
             next(error);
        }
    };

    // POST /admin/roles/:roleName/permissions
    assignPermissionToRole = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const adminUser = this.getAdminUser(req);
        try {
            const { roleName }: RoleNameParamsDto = req.params as any;
            const { permissionName }: RolePermissionAssignDto = req.body;
            await this.roleAdminService.assignPermissionToRole(adminUser, roleName, permissionName);
            res.status(HttpStatusCode.NO_CONTENT).send();
        } catch (error) {
             this.logger.error(`[RoleAdminCtrl] Failed to assign permission ${req.body?.permissionName} to role ${req.params?.roleName}`, { adminUserId: adminUser.id, error });
             next(error);
        }
    };

    // DELETE /admin/roles/:roleName/permissions/:permissionName
    removePermissionFromRole = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const adminUser = this.getAdminUser(req);
        try {
            const { roleName, permissionName }: RolePermissionUnassignParams = req.params as any;
            await this.roleAdminService.removePermissionFromRole(adminUser, roleName, permissionName);
            res.status(HttpStatusCode.NO_CONTENT).send();
        } catch (error) {
             this.logger.error(`[RoleAdminCtrl] Failed to remove permission ${req.params?.permissionName} from role ${req.params?.roleName}`, { adminUserId: adminUser.id, error });
             next(error);
        }
    };

    // GET /admin/roles/:roleName/permissions
    listPermissionsForRole = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const adminUser = this.getAdminUser(req);
        try {
            const { roleName }: RoleNameParamsDto = req.params as any;
            const permissions = await this.roleAdminService.listPermissionsForRole(adminUser, roleName);
            res.status(HttpStatusCode.OK).json({ permissions });
        } catch (error) {
             this.logger.error(`[RoleAdminCtrl] Failed to list permissions for role ${req.params?.roleName}`, { adminUserId: adminUser.id, error });
             next(error);
        }
    };
}
