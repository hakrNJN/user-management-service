import { inject, injectable } from 'tsyringe';
import { Group } from '../../domain/entities/Group';
import { AssignmentError, GroupExistsError, GroupNotFoundError, RoleNotFoundError } from '../../domain/exceptions/UserManagementError';
import { TYPES } from '../../shared/constants/types';
import { BaseError, NotFoundError } from '../../shared/errors/BaseError';
import { AdminUser } from '../../shared/types/admin-user.interface';
import { IAssignmentRepository } from '../interfaces/IAssignmentRepository';
import { IGroupAdminService } from '../interfaces/IGroupAdminService';
import { ILogger } from '../interfaces/ILogger';
import { IRoleRepository } from '../interfaces/IRoleRepository';
import { CreateGroupDetails, IUserMgmtAdapter } from '../interfaces/IUserMgmtAdapter';

@injectable()
export class GroupAdminService implements IGroupAdminService {
    constructor(
        @inject(TYPES.UserMgmtAdapter) private userMgmtAdapter: IUserMgmtAdapter,
        @inject(TYPES.AssignmentRepository) private assignmentRepository: IAssignmentRepository, // Injected
        @inject(TYPES.RoleRepository) private roleRepository: IRoleRepository,             // Injected
        @inject(TYPES.Logger) private logger: ILogger
    ) { }

    // Helper to check admin privileges (example)
    private checkAdminPermission(adminUser: AdminUser, requiredRole = 'admin'): void {
        if (!adminUser.roles?.includes(requiredRole)) {
            this.logger.warn(`Admin permission check failed for group operation`, { adminUserId: adminUser.id, requiredRole });
            throw new BaseError('ForbiddenError', 403, 'Admin privileges required for this operation.', true);
        }
        this.logger.debug(`Admin permission check passed for group operation`, { adminUserId: adminUser.id, requiredRole });
    }

    /**
     * Creates a new group.
     * @param adminUser - The admin user performing the operation.
     * @param details - The details of the group to create.
     * @returns A promise that resolves to the created Group.
     * @throws {GroupExistsError} If a group with the same name already exists.
     */
    async createGroup(adminUser: AdminUser, details: CreateGroupDetails): Promise<Group> {
        this.checkAdminPermission(adminUser);
        this.logger.info(`Admin attempting to create group`, { adminUserId: adminUser.id, groupName: details.groupName });
        try {
            const cognitoGroup = await this.userMgmtAdapter.adminCreateGroup(details);
            this.logger.info(`Admin successfully created group ${details.groupName}`, { adminUserId: adminUser.id });
            return Group.fromCognitoGroup(cognitoGroup);
        } catch (error: any) {
            this.logger.error(`Admin failed to create group ${details.groupName}`, { adminUserId: adminUser.id, error });
            // Re-throw specific errors mapped by adapter or handle here
            if (error instanceof GroupExistsError) throw error; // Already mapped
            throw error; // Re-throw others
        }
    }

    /**
     * Retrieves a group by its name.
     * @param adminUser - The admin user performing the operation.
     * @param groupName - The name of the group to retrieve.
     * @returns A promise that resolves to the Group if found, null otherwise.
     * @throws {Error} If an unexpected error occurs during the operation.
     */
    async getGroup(adminUser: AdminUser, groupName: string): Promise<Group | null> {
        this.checkAdminPermission(adminUser);
        this.logger.info(`Admin attempting to get group`, { adminUserId: adminUser.id, groupName });
        try {
            const cognitoGroup = await this.userMgmtAdapter.adminGetGroup(groupName);
            if (!cognitoGroup) {
                this.logger.warn(`Admin get group: Group not found`, { adminUserId: adminUser.id, groupName });
                return null;
            }
            this.logger.info(`Admin successfully retrieved group ${groupName}`, { adminUserId: adminUser.id });
            return Group.fromCognitoGroup(cognitoGroup);
        } catch (error: any) {
            this.logger.error(`Admin failed to get group ${groupName}`, { adminUserId: adminUser.id, error });
            // Adapter returns null for NotFound, so only re-throw unexpected errors
            throw error;
        }
    }

    /**
     * Lists all groups.
     * @param adminUser - The admin user performing the operation.
     * @param limit - The maximum number of groups to return.
     * @param nextToken - A token for pagination.
     * @returns A promise that resolves to an object containing an array of Groups and an optional nextToken.
     * @throws {Error} If an unexpected error occurs during the operation.
     */
    async listGroups(adminUser: AdminUser, limit?: number, nextToken?: string): Promise<{ groups: Group[], nextToken?: string }> {
        this.checkAdminPermission(adminUser);
        this.logger.info(`Admin attempting to list groups`, { adminUserId: adminUser.id, limit, nextToken });
        try {
            const result = await this.userMgmtAdapter.adminListGroups(limit, nextToken);
            const domainGroups = result.groups.map(g => Group.fromCognitoGroup(g));
            this.logger.info(`Admin successfully listed ${domainGroups.length} groups`, { adminUserId: adminUser.id });
            return { groups: domainGroups, nextToken: result.nextToken };
        } catch (error: any) {
            this.logger.error(`Admin failed to list groups`, { adminUserId: adminUser.id, error });
            throw error;
        }
    }

    /**
     * Deletes a group by its name.
     * @param adminUser - The admin user performing the operation.
     * @param groupName - The name of the group to delete.
     * @returns A promise that resolves when the group has been deleted.
     * @throws {Error} If an unexpected error occurs during the operation.
     */
    async deleteGroup(adminUser: AdminUser, groupName: string): Promise<void> {
        this.checkAdminPermission(adminUser);
        this.logger.info(`Admin attempting to delete group ${groupName}`, { adminUserId: adminUser.id });

        // 1. Delete Cognito Group first
        try {
            await this.userMgmtAdapter.adminDeleteGroup(groupName);
            this.logger.info(`Admin successfully deleted Cognito group ${groupName}`, { adminUserId: adminUser.id });
        } catch (error: any) {
            this.logger.error(`Admin failed to delete Cognito group ${groupName}`, { adminUserId: adminUser.id, error });
            // If adapter maps ResourceNotFoundException to NotFoundError or GroupNotFoundError, handle it
            if (error instanceof NotFoundError || error instanceof GroupNotFoundError || (error instanceof BaseError && error.statusCode === 404)) {
                throw new GroupNotFoundError(groupName); // Ensure consistent error type
            }
            throw error; // Re-throw other adapter errors
        }

        // 2. If Cognito deletion successful, cleanup assignments
        this.logger.info(`Cognito group ${groupName} deleted, attempting assignment cleanup...`, { adminUserId: adminUser.id });
        try {
            await this.assignmentRepository.removeAllAssignmentsForGroup(groupName);
            this.logger.info(`Successfully cleaned up assignments for deleted group ${groupName}`, { adminUserId: adminUser.id });
        } catch (cleanupError: any) {
            this.logger.error(`Failed to cleanup assignments for deleted group ${groupName}. Manual cleanup might be needed.`, { adminUserId: adminUser.id, error: cleanupError });
            // Re-throw cleanup error to indicate incomplete operation
            throw new BaseError('CleanupFailedError', 500, `Cognito Group ${groupName} was deleted, but failed to remove associated role assignments: ${cleanupError.message}`, false);
        }

        this.logger.info(`Admin successfully deleted group '${groupName}' and cleaned up assignments`, { adminUserId: adminUser.id });
    }

    async assignRoleToGroup(adminUser: AdminUser, groupName: string, roleName: string): Promise<void> {
        this.checkAdminPermission(adminUser);
        this.logger.info(`Admin attempting to assign role '${roleName}' to group '${groupName}'`, { adminUserId: adminUser.id });

        // Validate Cognito Group exists
        const group = await this.getGroup(adminUser, groupName); // Reuse getGroup for check & permissions
        if (!group) {
            throw new GroupNotFoundError(groupName); // Use specific error
        }

        // Validate Custom Role exists
        const role = await this.roleRepository.findByName(roleName);
        if (!role) {
            this.logger.warn(`Assign role to group failed: Role '${roleName}' not found`, { adminUserId: adminUser.id, groupName });
            throw new RoleNotFoundError(roleName);
        }

        // Perform assignment
        try {
            await this.assignmentRepository.assignRoleToGroup(groupName, roleName);
            this.logger.info(`Admin successfully assigned role '${roleName}' to group '${groupName}'`, { adminUserId: adminUser.id });
        } catch (error: any) {
            this.logger.error(`Admin failed to assign role '${roleName}' to group '${groupName}'`, { adminUserId: adminUser.id, error });
            throw new AssignmentError(`Failed to assign role '${roleName}' to group '${groupName}': ${error.message}`);
        }
    }

    async removeRoleFromGroup(adminUser: AdminUser, groupName: string, roleName: string): Promise<void> {
        this.checkAdminPermission(adminUser);
        this.logger.info(`Admin attempting to remove role '${roleName}' from group '${groupName}'`, { adminUserId: adminUser.id });

        // Optional: Validate group/role existence before removal? Often not needed for delete.
        // const group = await this.getGroup(adminUser, groupName);
        // if (!group) throw new GroupNotFoundError(groupName);
        // const role = await this.roleRepository.findByName(roleName);
        // if (!role) throw new RoleNotFoundError(roleName);

        try {
            await this.assignmentRepository.removeRoleFromGroup(groupName, roleName);
            this.logger.info(`Admin successfully removed role '${roleName}' from group '${groupName}'`, { adminUserId: adminUser.id });
        } catch (error: any) {
            this.logger.error(`Admin failed to remove role '${roleName}' from group '${groupName}'`, { adminUserId: adminUser.id, error });
            throw new AssignmentError(`Failed to remove role '${roleName}' from group '${groupName}': ${error.message}`);
        }
    }

    async listRolesForGroup(adminUser: AdminUser, groupName: string): Promise<string[]> {
        this.checkAdminPermission(adminUser);
        this.logger.info(`Admin attempting to list roles for group '${groupName}'`, { adminUserId: adminUser.id });

        // Validate Cognito Group exists
        const group = await this.getGroup(adminUser, groupName);
        if (!group) {
            throw new GroupNotFoundError(groupName);
        }

        try {
            const roleNames = await this.assignmentRepository.findRolesByGroupName(groupName);
            this.logger.info(`Admin successfully listed ${roleNames.length} roles for group '${groupName}'`, { adminUserId: adminUser.id });
            return roleNames;
        } catch (error: any) {
            this.logger.error(`Admin failed to list roles for group '${groupName}'`, { adminUserId: adminUser.id, error });
            throw error; // Re-throw repo errors
        }
    }
}
