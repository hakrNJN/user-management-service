import { inject, injectable } from 'tsyringe';
import { Role } from '../../domain/entities/Role';
import { AssignmentError, PermissionNotFoundError, RoleExistsError, RoleNotFoundError } from '../../domain/exceptions/UserManagementError';
import { TYPES } from '../../shared/constants/types';
import { BaseError } from '../../shared/errors/BaseError';
import { AdminUser } from '../../shared/types/admin-user.interface';
import { IAssignmentRepository } from '../interfaces/IAssignmentRepository';
import { ILogger } from '../interfaces/ILogger';
import { IPermissionRepository } from '../interfaces/IPermissionRepository'; // Needed for validation
import { IRoleAdminService } from '../interfaces/IRoleAdminService';
import { IRoleRepository } from '../interfaces/IRoleRepository';
import { QueryOptions, QueryResult } from '../../shared/types/query.types';

@injectable()
export class RoleAdminService implements IRoleAdminService {
    constructor(
        @inject(TYPES.RoleRepository) private roleRepository: IRoleRepository,
        @inject(TYPES.AssignmentRepository) private assignmentRepository: IAssignmentRepository,
        @inject(TYPES.PermissionRepository) private permissionRepository: IPermissionRepository, // Inject Permission repo
        @inject(TYPES.Logger) private logger: ILogger
    ) {}

    // Helper for authorization check
    private checkAdminPermission(adminUser: AdminUser, requiredRole = 'admin'): void {
        if (!adminUser.roles?.includes(requiredRole)) {
            this.logger.warn(`Admin permission check failed for role operation`, { adminUserId: adminUser.id, requiredRole });
            throw new BaseError('ForbiddenError', 403, 'Admin privileges required for this role operation.', true);
        }
        this.logger.debug(`Admin permission check passed for role operation`, { adminUserId: adminUser.id, requiredRole });
    }

    async createRole(adminUser: AdminUser, details: { roleName: string; description?: string }): Promise<Role> {
        this.checkAdminPermission(adminUser);
        this.logger.info(`Admin attempting to create role`, { adminUserId: adminUser.id, roleName: details.roleName });

        // Optionally check if role already exists first, though repo create should handle condition
        // const existing = await this.roleRepository.findByName(details.roleName);
        // if (existing) {
        //     throw new RoleExistsError(details.roleName);
        // }

        const newRole = new Role(details.roleName, details.description); // Create domain entity instance
        try {
            await this.roleRepository.create(newRole);
            this.logger.info(`Admin successfully created role '${details.roleName}'`, { adminUserId: adminUser.id });
            // Return the created instance (repo create is void, so we use the instance we passed)
            return newRole;
        } catch (error: any) {
             this.logger.error(`Admin failed to create role ${details.roleName}`, { adminUserId: adminUser.id, error });
             // Re-throw specific errors if repo maps them (like RoleExistsError)
             if (error instanceof RoleExistsError) throw error;
             // Throw others as generic or wrap them
             throw error;
        }
    }

    async getRole(adminUser: AdminUser, roleName: string): Promise<Role | null> {
        this.checkAdminPermission(adminUser);
        this.logger.info(`Admin attempting to get role`, { adminUserId: adminUser.id, roleName });
        try {
            const role = await this.roleRepository.findByName(roleName);
            if (!role) {
                this.logger.warn(`Admin get role: Role not found`, { adminUserId: adminUser.id, roleName });
                return null;
            }
            this.logger.info(`Admin successfully retrieved role ${roleName}`, { adminUserId: adminUser.id });
            return role;
        } catch (error: any) {
             this.logger.error(`Admin failed to get role ${roleName}`, { adminUserId: adminUser.id, error });
             // Re-throw unexpected repo errors
             throw error;
        }
    }

    async listRoles(adminUser: AdminUser, options?: QueryOptions): Promise<QueryResult<Role>> {
        this.checkAdminPermission(adminUser);
        this.logger.info(`Admin attempting to list roles`, { adminUserId: adminUser.id, options });
        try {
            const result = await this.roleRepository.list(options);
            this.logger.info(`Admin successfully listed ${result.items.length} roles`, { adminUserId: adminUser.id });
            return result;
        } catch (error: any) {
             this.logger.error(`Admin failed to list roles`, { adminUserId: adminUser.id, error });
             throw error;
        }
    }

    async updateRole(adminUser: AdminUser, roleName: string, updates: { description?: string }): Promise<Role | null> {
        this.checkAdminPermission(adminUser);
        this.logger.info(`Admin attempting to update role ${roleName}`, { adminUserId: adminUser.id, updates });
        try {
            const updatedRole = await this.roleRepository.update(roleName, updates);
            if (!updatedRole) {
                 this.logger.warn(`Admin update role: Role not found for update`, { adminUserId: adminUser.id, roleName });
                 return null;
            }
            this.logger.info(`Admin successfully updated role ${roleName}`, { adminUserId: adminUser.id });
            return updatedRole;
        } catch (error: any) {
             this.logger.error(`Admin failed to update role ${roleName}`, { adminUserId: adminUser.id, error });
             throw error;
        }
    }

    async deleteRole(adminUser: AdminUser, roleName: string): Promise<void> {
        this.checkAdminPermission(adminUser);
        this.logger.info(`Admin attempting to delete role ${roleName}`, { adminUserId: adminUser.id });

        // 1. Attempt to delete the role itself
        let deleted: boolean;
        try {
            deleted = await this.roleRepository.delete(roleName);
        } catch (error: any) {
            this.logger.error(`Admin failed during role deletion (repo operation)`, { adminUserId: adminUser.id, roleName, error });
            throw error; // Re-throw repo errors
        }

        // 2. Check if deletion occurred (role existed)
        if (!deleted) {
            this.logger.warn(`Admin delete role: Role not found for deletion`, { adminUserId: adminUser.id, roleName });
            throw new RoleNotFoundError(roleName); // Throw specific not found error
        }

        // 3. If role deleted, attempt to cleanup assignments
        this.logger.info(`Role ${roleName} deleted from repository, attempting assignment cleanup...`, { adminUserId: adminUser.id });
        try {
            await this.assignmentRepository.removeAllAssignmentsForRole(roleName);
            this.logger.info(`Successfully cleaned up assignments for deleted role ${roleName}`, { adminUserId: adminUser.id });
        } catch (cleanupError: any) {
            // Log the cleanup error, but still consider the primary deletion successful?
            // OR: Re-throw to indicate the overall operation wasn't fully clean. Re-throwing is often safer.
            this.logger.error(`Failed to cleanup assignments for deleted role ${roleName}. Manual cleanup might be needed.`, { adminUserId: adminUser.id, error: cleanupError });
            // Decide on re-throw strategy - throwing ensures caller knows cleanup failed
             throw new BaseError('CleanupFailedError', 500, `Role ${roleName} was deleted, but failed to remove associated assignments: ${cleanupError.message}`, false); // isOperational = false potentially
        }

        this.logger.info(`Admin successfully deleted role '${roleName}' and cleaned up assignments`, { adminUserId: adminUser.id });
    }

    async assignPermissionToRole(adminUser: AdminUser, roleName: string, permissionName: string): Promise<void> {
        this.checkAdminPermission(adminUser);
        this.logger.info(`Admin attempting to assign permission '${permissionName}' to role '${roleName}'`, { adminUserId: adminUser.id });

        // Validate role exists
        const role = await this.roleRepository.findByName(roleName);
        if (!role) {
            this.logger.warn(`Assign permission failed: Role '${roleName}' not found`, { adminUserId: adminUser.id });
            throw new RoleNotFoundError(roleName);
        }

        // Validate permission exists
        const permission = await this.permissionRepository.findByName(permissionName);
        if (!permission) {
            this.logger.warn(`Assign permission failed: Permission '${permissionName}' not found`, { adminUserId: adminUser.id });
            throw new PermissionNotFoundError(permissionName);
        }

        try {
            await this.assignmentRepository.assignPermissionToRole(roleName, permissionName);
            this.logger.info(`Admin successfully assigned permission '${permissionName}' to role '${roleName}'`, { adminUserId: adminUser.id });
        } catch (error: any) {
             this.logger.error(`Admin failed to assign permission '${permissionName}' to role '${roleName}'`, { adminUserId: adminUser.id, error });
             // Wrap or re-throw assignment errors
             throw new AssignmentError(`Failed to assign permission '${permissionName}' to role '${roleName}': ${error.message}`);
        }
    }

    async removePermissionFromRole(adminUser: AdminUser, roleName: string, permissionName: string): Promise<void> {
        this.checkAdminPermission(adminUser);
        this.logger.info(`Admin attempting to remove permission '${permissionName}' from role '${roleName}'`, { adminUserId: adminUser.id });

        // No need to check existence before removal typically
        try {
            await this.assignmentRepository.removePermissionFromRole(roleName, permissionName);
            this.logger.info(`Admin successfully removed permission '${permissionName}' from role '${roleName}'`, { adminUserId: adminUser.id });
        } catch (error: any) {
             this.logger.error(`Admin failed to remove permission '${permissionName}' from role '${roleName}'`, { adminUserId: adminUser.id, error });
             throw new AssignmentError(`Failed to remove permission '${permissionName}' from role '${roleName}': ${error.message}`);
        }
    }

    async listPermissionsForRole(adminUser: AdminUser, roleName: string): Promise<string[]> {
        this.checkAdminPermission(adminUser);
        this.logger.info(`Admin attempting to list permissions for role '${roleName}'`, { adminUserId: adminUser.id });

        // Validate role exists
        const role = await this.roleRepository.findByName(roleName);
        if (!role) {
            this.logger.warn(`List permissions failed: Role '${roleName}' not found`, { adminUserId: adminUser.id });
            throw new RoleNotFoundError(roleName);
        }

        try {
            const permissionNames = await this.assignmentRepository.findPermissionsByRoleName(roleName);
            this.logger.info(`Admin successfully listed ${permissionNames.length} permissions for role '${roleName}'`, { adminUserId: adminUser.id });
            return permissionNames;
        } catch (error: any) {
             this.logger.error(`Admin failed to list permissions for role '${roleName}'`, { adminUserId: adminUser.id, error });
             throw error; // Re-throw repo errors
        }
    }
}