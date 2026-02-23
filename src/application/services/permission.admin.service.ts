import { inject, injectable } from 'tsyringe';
import { Permission } from '../../domain/entities/Permission';
import { PermissionExistsError, PermissionNotFoundError } from '../../domain/exceptions/UserManagementError';
import { TYPES } from '../../shared/constants/types';
import { BaseError } from '../../shared/errors/BaseError';
import { AdminUser } from '../../shared/types/admin-user.interface';
import { IAssignmentRepository } from '../interfaces/IAssignmentRepository';
import { ILogger } from '../interfaces/ILogger';
import { IPermissionAdminService } from '../interfaces/IPermissionAdminService';
import { IPermissionRepository } from '../interfaces/IPermissionRepository';
import { QueryOptions, QueryResult } from '../../shared/types/query.types';

@injectable()
export class PermissionAdminService implements IPermissionAdminService {
    constructor(
        @inject(TYPES.PermissionRepository) private permissionRepository: IPermissionRepository,
        @inject(TYPES.AssignmentRepository) private assignmentRepository: IAssignmentRepository,
        @inject(TYPES.Logger) private logger: ILogger
    ) { }

    // Helper for authorization check
    private checkAdminPermission(adminUser: AdminUser, requiredRole = 'admin'): void {
        if (!adminUser.roles?.includes(requiredRole)) {
            this.logger.warn(`Admin permission check failed for permission operation`, { adminUserId: adminUser.id, requiredRole });
            throw new BaseError('ForbiddenError', 403, 'Admin privileges required for this permission operation.', true);
        }
        this.logger.debug(`Admin permission check passed for permission operation`, { adminUserId: adminUser.id, requiredRole });
    }

    async createPermission(adminUser: AdminUser, details: { permissionName: string; description?: string }): Promise<Permission> {
        this.checkAdminPermission(adminUser);
        this.logger.info(`Admin attempting to create permission`, { adminUserId: adminUser.id, permissionName: details.permissionName });

        const newPermission = new Permission(adminUser.tenantId, details.permissionName, details.description);
        try {
            await this.permissionRepository.create(newPermission);
            this.logger.info(`Admin successfully created permission '${details.permissionName}'`, { adminUserId: adminUser.id });
            return newPermission;
        } catch (error: any) {
            this.logger.error(`Admin failed to create permission ${details.permissionName}`, { adminUserId: adminUser.id, error });
            if (error instanceof PermissionExistsError) throw error;
            throw error;
        }
    }

    async getPermission(adminUser: AdminUser, permissionName: string): Promise<Permission | null> {
        this.checkAdminPermission(adminUser);
        this.logger.info(`Admin attempting to get permission`, { adminUserId: adminUser.id, permissionName });
        try {
            const permission = await this.permissionRepository.findByName(adminUser.tenantId, permissionName);
            if (!permission) {
                this.logger.warn(`Admin get permission: Permission not found`, { adminUserId: adminUser.id, permissionName });
                return null;
            }
            this.logger.info(`Admin successfully retrieved permission ${permissionName}`, { adminUserId: adminUser.id });
            return permission;
        } catch (error: any) {
            this.logger.error(`Admin failed to get permission ${permissionName}`, { adminUserId: adminUser.id, error });
            throw error;
        }
    }

    async listPermissions(adminUser: AdminUser, options?: QueryOptions): Promise<QueryResult<Permission>> {
        this.checkAdminPermission(adminUser);
        this.logger.info(`Admin attempting to list permissions`, { adminUserId: adminUser.id, options });
        try {
            const result = await this.permissionRepository.list(adminUser.tenantId, options);
            this.logger.info(`Admin successfully listed ${result.items.length} permissions`, { adminUserId: adminUser.id });
            return result;
        } catch (error: any) {
            this.logger.error(`Admin failed to list permissions`, { adminUserId: adminUser.id, error });
            throw error;
        }
    }

    async updatePermission(adminUser: AdminUser, permissionName: string, updates: { description?: string }): Promise<Permission | null> {
        this.checkAdminPermission(adminUser);
        this.logger.info(`Admin attempting to update permission ${permissionName}`, { adminUserId: adminUser.id, updates });
        try {
            const updatedPermission = await this.permissionRepository.update(adminUser.tenantId, permissionName, updates);
            if (!updatedPermission) {
                this.logger.warn(`Admin update permission: Permission not found for update`, { adminUserId: adminUser.id, permissionName });
                return null;
            }
            this.logger.info(`Admin successfully updated permission ${permissionName}`, { adminUserId: adminUser.id });
            return updatedPermission;
        } catch (error: any) {
            this.logger.error(`Admin failed to update permission ${permissionName}`, { adminUserId: adminUser.id, error });
            throw error;
        }
    }

    async deletePermission(adminUser: AdminUser, permissionName: string): Promise<void> {
        this.checkAdminPermission(adminUser);
        this.logger.info(`Admin attempting to delete permission ${permissionName}`, { adminUserId: adminUser.id });

        // 1. Attempt to delete the permission itself
        let deleted: boolean;
        try {
            deleted = await this.permissionRepository.delete(adminUser.tenantId, permissionName);
        } catch (error: any) {
            this.logger.error(`Admin failed during permission deletion (repo operation)`, { adminUserId: adminUser.id, permissionName, error });
            throw error;
        }

        // 2. Check if deletion occurred
        if (!deleted) {
            this.logger.warn(`Admin delete permission: Permission not found for deletion`, { adminUserId: adminUser.id, permissionName });
            throw new PermissionNotFoundError(permissionName);
        }

        // 3. If deleted, cleanup assignments
        this.logger.info(`Permission ${permissionName} deleted from repository, attempting assignment cleanup...`, { adminUserId: adminUser.id });
        try {
            await this.assignmentRepository.removeAllAssignmentsForPermission(adminUser.tenantId, permissionName);
            this.logger.info(`Successfully cleaned up assignments for deleted permission ${permissionName}`, { adminUserId: adminUser.id });
        } catch (cleanupError: any) {
            this.logger.error(`Failed to cleanup assignments for deleted permission ${permissionName}. Manual cleanup might be needed.`, { adminUserId: adminUser.id, error: cleanupError });
            // Re-throw cleanup error
            throw new BaseError('CleanupFailedError', 500, `Permission ${permissionName} was deleted, but failed to remove associated assignments: ${cleanupError.message}`, false);
        }

        this.logger.info(`Admin Successfully deleted permission '${permissionName}' and cleaned up assignments`, { adminUserId: adminUser.id });
    }

    async listRolesForPermission(adminUser: AdminUser, permissionName: string): Promise<string[]> {
        this.checkAdminPermission(adminUser);
        this.logger.info(`Admin attempting to list roles for permission '${permissionName}'`, { adminUserId: adminUser.id });

        // Validate permission exists
        const permission = await this.permissionRepository.findByName(adminUser.tenantId, permissionName);
        if (!permission) {
            this.logger.warn(`List roles failed: Permission '${permissionName}' not found`, { adminUserId: adminUser.id });
            throw new PermissionNotFoundError(permissionName);
        }

        try {
            const roleNames = await this.assignmentRepository.findRolesByPermissionName(adminUser.tenantId, permissionName);
            this.logger.info(`Admin successfully listed ${roleNames.length} roles for permission '${permissionName}'`, { adminUserId: adminUser.id });
            return roleNames;
        } catch (error: any) {
            this.logger.error(`Admin failed to list roles for permission '${permissionName}'`, { adminUserId: adminUser.id, error });
            throw error;
        }
    }
}