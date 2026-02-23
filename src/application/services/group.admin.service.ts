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
    private checkAdminPermission(adminUser: AdminUser, requiredPermission: string): void {
        // For beta, a simple check: if adminUser has 'admin' role, they have all permissions.
        // In a production system, this would involve a more sophisticated permission mapping
        // (e.g., roles -> permissions lookup, or direct permission assignment).
        if (!adminUser.roles?.includes('admin')) {
            this.logger.warn(`Admin permission check failed: User ${adminUser.username} does not have 'admin' role. Required permission: ${requiredPermission}`, { adminUserId: adminUser.id, requiredPermission });
            throw new BaseError('ForbiddenError', 403, `Admin privileges required for this operation: ${requiredPermission}.`, true);
        }
        this.logger.debug(`Admin permission check passed for ${requiredPermission}`, { adminUserId: adminUser.id, requiredPermission });
    }

    private logAuditEvent(adminUser: AdminUser, action: string, targetType: string, targetId: string, status: 'SUCCESS' | 'FAILURE', details?: any): void {
        this.logger.info(`AUDIT: Admin ${adminUser.username} performed ${action} on ${targetType} ${targetId} - ${status}`, { adminUserId: adminUser.id, action, targetType, targetId, status, details });
    }

    /**
     * Creates a new group.
     * @param adminUser - The admin user performing the operation.
     * @param details - The details of the group to create.
     * @returns A promise that resolves to the created Group.
     * @throws {GroupExistsError} If a group with the same name already exists.
     */
    async createGroup(adminUser: AdminUser, details: CreateGroupDetails): Promise<Group> {
        this.checkAdminPermission(adminUser, 'group:create');
        try {
            const cognitoGroup = await this.userMgmtAdapter.adminCreateGroup(details);
            this.logAuditEvent(adminUser, 'CREATE_GROUP', 'GROUP', details.groupName, 'SUCCESS', { groupDetails: details });
            return Group.fromCognitoGroup(adminUser.tenantId, cognitoGroup);
        } catch (error: any) {
            this.logAuditEvent(adminUser, 'CREATE_GROUP', 'GROUP', details.groupName, 'FAILURE', { error: error.message });
            throw error;
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
        this.checkAdminPermission(adminUser, 'group:read');
        this.logger.info(`Admin attempting to get group`, { adminUserId: adminUser.id, groupName });
        try {
            const cognitoGroup = await this.userMgmtAdapter.adminGetGroup(groupName);
            if (!cognitoGroup) {
                this.logger.warn(`Admin get group: Group not found`, { adminUserId: adminUser.id, groupName });
                return null;
            }
            this.logger.info(`Admin successfully retrieved group ${groupName}`, { adminUserId: adminUser.id });
            return Group.fromCognitoGroup(adminUser.tenantId, cognitoGroup);
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
    async listGroups(adminUser: AdminUser, limit?: number, nextToken?: string, filter?: string, includeInactive: boolean = false): Promise<{ groups: Group[], nextToken?: string }> {
        this.checkAdminPermission(adminUser, 'group:list');
        this.logger.info(`Admin attempting to list groups`, { adminUserId: adminUser.id, limit, nextToken, filter, includeInactive });
        try {
            const result = await this.userMgmtAdapter.adminListGroups(limit, nextToken, filter);
            let domainGroups = result.groups.map(g => Group.fromCognitoGroup(adminUser.tenantId, g));

            // Filter by status unless specified otherwise
            if (!includeInactive) {
                domainGroups = domainGroups.filter(g => g.status === 'ACTIVE');
            }

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
        this.checkAdminPermission(adminUser, 'group:delete');
        try {
            await this.userMgmtAdapter.adminDeleteGroup(groupName);
            this.logAuditEvent(adminUser, 'DEACTIVATE_GROUP', 'GROUP', groupName, 'SUCCESS');
        } catch (error: any) {
            this.logAuditEvent(adminUser, 'DEACTIVATE_GROUP', 'GROUP', groupName, 'FAILURE', { error: error.message });
            throw error;
        }
    }

    async reactivateGroup(adminUser: AdminUser, groupName: string): Promise<void> {
        this.checkAdminPermission(adminUser, 'group:update');
        try {
            await this.userMgmtAdapter.adminReactivateGroup(groupName);
            this.logAuditEvent(adminUser, 'REACTIVATE_GROUP', 'GROUP', groupName, 'SUCCESS');
        } catch (error: any) {
            this.logAuditEvent(adminUser, 'REACTIVATE_GROUP', 'GROUP', groupName, 'FAILURE', { error: error.message });
            throw error;
        }
    }

    async assignRoleToGroup(adminUser: AdminUser, groupName: string, roleName: string): Promise<void> {
        this.checkAdminPermission(adminUser, 'group:role:assign');
        this.logger.info(`Admin attempting to assign role '${roleName}' to group '${groupName}'`, { adminUserId: adminUser.id });

        // Validate Cognito Group exists
        const group = await this.getGroup(adminUser, groupName); // Reuse getGroup for check & permissions
        if (!group) {
            throw new GroupNotFoundError(groupName); // Use specific error
        }

        // Validate Custom Role exists
        const role = await this.roleRepository.findByName(adminUser.tenantId, roleName);
        if (!role) {
            this.logger.warn(`Assign role to group failed: Role '${roleName}' not found`, { adminUserId: adminUser.id, groupName });
            throw new RoleNotFoundError(roleName);
        }

        // Perform assignment
        try {
            await this.assignmentRepository.assignRoleToGroup(adminUser.tenantId, groupName, roleName);
            this.logger.info(`Admin successfully assigned role '${roleName}' to group '${groupName}'`, { adminUserId: adminUser.id });
        } catch (error: any) {
            this.logger.error(`Admin failed to assign role '${roleName}' to group '${groupName}'`, { adminUserId: adminUser.id, error });
            throw new AssignmentError(`Failed to assign role '${roleName}' to group '${groupName}': ${error.message}`);
        }
    }

    async removeRoleFromGroup(adminUser: AdminUser, groupName: string, roleName: string): Promise<void> {
        this.checkAdminPermission(adminUser, 'group:role:remove');
        try {
            await this.assignmentRepository.removeRoleFromGroup(adminUser.tenantId, groupName, roleName);
            this.logAuditEvent(adminUser, 'REMOVE_ROLE_FROM_GROUP', 'GROUP', groupName, 'SUCCESS', { role: roleName });
        } catch (error: any) {
            this.logAuditEvent(adminUser, 'REMOVE_ROLE_FROM_GROUP', 'GROUP', groupName, 'FAILURE', { role: roleName, error: error.message });
            throw new AssignmentError(`Failed to remove role '${roleName}' from group '${groupName}': ${error.message}`);
        }
    }

    async listRolesForGroup(adminUser: AdminUser, groupName: string): Promise<string[]> {
        this.checkAdminPermission(adminUser, 'group:role:list');
        this.logger.info(`Admin attempting to list roles for group '${groupName}'`, { adminUserId: adminUser.id });

        // Validate Cognito Group exists
        const group = await this.getGroup(adminUser, groupName);
        if (!group) {
            throw new GroupNotFoundError(groupName);
        }

        try {
            const roleNames = await this.assignmentRepository.findRolesByGroupName(adminUser.tenantId, groupName);
            this.logger.info(`Admin successfully listed ${roleNames.length} roles for group '${groupName}'`, { adminUserId: adminUser.id });
            return roleNames;
        } catch (error: any) {
            this.logger.error(`Admin failed to list roles for group '${groupName}'`, { adminUserId: adminUser.id, error });
            throw error; // Re-throw repo errors
        }
    }
}