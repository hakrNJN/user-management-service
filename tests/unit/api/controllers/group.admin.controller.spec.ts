// tests/unit/application/services/group.admin.service.spec.ts

import { GroupType } from '@aws-sdk/client-cognito-identity-provider'; // Import SDK type
import { ILogger } from '../../../../src/application/interfaces/ILogger';
import { CreateGroupDetails, IUserMgmtAdapter } from '../../../../src/application/interfaces/IUserMgmtAdapter';
import { GroupAdminService } from '../../../../src/application/services/group.admin.service';
import { Group } from '../../../../src/domain/entities/Group';
import { GroupExistsError } from '../../../../src/domain/exceptions/UserManagementError';
import { BaseError } from '../../../../src/shared/errors/BaseError';
import { mockUserMgmtAdapter } from '../../../mocks/adapter.mock';
import { mockAdminUser, mockNonAdminUser } from '../../../mocks/adminUser.mock';
import { mockLogger } from '../../../mocks/logger.mock';

describe('GroupAdminService', () => {
    let service: GroupAdminService;
    let adapter: jest.Mocked<IUserMgmtAdapter>;
    let logger: jest.Mocked<ILogger>;

    beforeEach(() => {
        jest.clearAllMocks();
        // Use fresh mocks for each test
        adapter = { ...mockUserMgmtAdapter } as jest.Mocked<IUserMgmtAdapter>;
        logger = { ...mockLogger } as jest.Mocked<ILogger>;
        service = new GroupAdminService(adapter, logger);
    });

    // --- createGroup ---
    describe('createGroup', () => {
        const groupDetails: CreateGroupDetails = { groupName: 'new-group', description: 'A new group' };
        const mockCognitoGroup: GroupType = { // Use SDK Type
            GroupName: groupDetails.groupName,
            Description: groupDetails.description,
            UserPoolId: 'pool-id',
            CreationDate: new Date(),
            LastModifiedDate: new Date(),
        };

        it('should call adapter.adminCreateGroup and return mapped Group on success', async () => {
            adapter.adminCreateGroup.mockResolvedValue(mockCognitoGroup);

            const result = await service.createGroup(mockAdminUser, groupDetails);

            expect(result).toBeInstanceOf(Group);
            expect(result.groupName).toBe(groupDetails.groupName);
            expect(result.description).toBe(groupDetails.description);
            expect(adapter.adminCreateGroup).toHaveBeenCalledWith(groupDetails);
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('attempting to create group'), expect.any(Object));
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('successfully created group'), expect.any(Object));
            expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Admin permission check passed'), expect.any(Object));
        });

        it('should throw ForbiddenError if admin user lacks permission', async () => {
            await expect(service.createGroup(mockNonAdminUser, groupDetails))
                .rejects.toThrow(new BaseError('ForbiddenError', 403, 'Admin privileges required for this operation.', true));
            expect(adapter.adminCreateGroup).not.toHaveBeenCalled();
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Admin permission check failed'), expect.any(Object));
        });

        it('should re-throw GroupExistsError from adapter', async () => {
            const error = new GroupExistsError(groupDetails.groupName);
            adapter.adminCreateGroup.mockRejectedValue(error);

            await expect(service.createGroup(mockAdminUser, groupDetails))
                .rejects.toThrow(GroupExistsError);
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('failed to create group'), expect.objectContaining({ error }));
        });

        it('should re-throw other errors from adapter', async () => {
            const error = new Error("Cognito internal error");
            adapter.adminCreateGroup.mockRejectedValue(error);

            await expect(service.createGroup(mockAdminUser, groupDetails))
                .rejects.toThrow(error);
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('failed to create group'), expect.objectContaining({ error }));
        });
    });

    // --- getGroup ---
    describe('getGroup', () => {
        const groupName = 'existing-group';
        const mockCognitoGroup: GroupType = {
            GroupName: groupName, UserPoolId: 'pool-id', CreationDate: new Date(), LastModifiedDate: new Date(),
        };

        it('should call adapter.adminGetGroup and return mapped Group if found', async () => {
            adapter.adminGetGroup.mockResolvedValue(mockCognitoGroup);

            const result = await service.getGroup(mockAdminUser, groupName);

            expect(result).toBeInstanceOf(Group);
            expect(result?.groupName).toBe(groupName);
            expect(adapter.adminGetGroup).toHaveBeenCalledWith(groupName);
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('successfully retrieved group'), expect.any(Object));
        });

        it('should return null if adapter returns null (group not found)', async () => {
            adapter.adminGetGroup.mockResolvedValue(null);

            const result = await service.getGroup(mockAdminUser, groupName);

            expect(result).toBeNull();
            expect(adapter.adminGetGroup).toHaveBeenCalledWith(groupName);
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Group not found'), expect.any(Object));
        });

        it('should throw ForbiddenError if admin user lacks permission', async () => {
            await expect(service.getGroup(mockNonAdminUser, groupName))
                .rejects.toThrow(BaseError); // Check base error or specific Forbidden
            await expect(service.getGroup(mockNonAdminUser, groupName))
                .rejects.toHaveProperty('statusCode', 403);
            expect(adapter.adminGetGroup).not.toHaveBeenCalled();
        });

        it('should re-throw errors from adapter', async () => {
            const error = new Error("Cognito internal error");
            adapter.adminGetGroup.mockRejectedValue(error);

            await expect(service.getGroup(mockAdminUser, groupName))
                .rejects.toThrow(error);
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('failed to get group'), expect.objectContaining({ error }));
        });
    });

    // --- listGroups ---
    describe('listGroups', () => {
        const mockCognitoGroups: GroupType[] = [
            { GroupName: 'group1', UserPoolId: 'pool-id' },
            { GroupName: 'group2', UserPoolId: 'pool-id' },
        ];

        it('should call adapter.adminListGroups and return mapped Groups', async () => {
            adapter.adminListGroups.mockResolvedValue({ groups: mockCognitoGroups, nextToken: 'token123' });

            const result = await service.listGroups(mockAdminUser, 10, 'startToken');

            expect(result.groups).toHaveLength(2);
            expect(result.groups[0]).toBeInstanceOf(Group);
            expect(result.groups[0].groupName).toBe('group1');
            expect(result.nextToken).toBe('token123');
            expect(adapter.adminListGroups).toHaveBeenCalledWith(10, 'startToken');
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('successfully listed 2 groups'), expect.any(Object));
        });

        it('should handle empty list from adapter', async () => {
            adapter.adminListGroups.mockResolvedValue({ groups: [], nextToken: undefined });
            const result = await service.listGroups(mockAdminUser);
            expect(result.groups).toHaveLength(0);
            expect(result.nextToken).toBeUndefined();
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('successfully listed 0 groups'), expect.any(Object));
        });

        it('should throw ForbiddenError if admin user lacks permission', async () => {
            await expect(service.listGroups(mockNonAdminUser))
                .rejects.toThrow(BaseError);
            await expect(service.listGroups(mockNonAdminUser))
                .rejects.toHaveProperty('statusCode', 403);
            expect(adapter.adminListGroups).not.toHaveBeenCalled();
        });

        // Add test for re-throwing adapter errors
    });

    // --- deleteGroup ---
    describe('deleteGroup', () => {
        const groupName = 'group-to-delete';

        it('should call adapter.adminDeleteGroup on success', async () => {
            adapter.adminDeleteGroup.mockResolvedValue(undefined); // Resolves void

            await service.deleteGroup(mockAdminUser, groupName);

            expect(adapter.adminDeleteGroup).toHaveBeenCalledWith(groupName);
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('successfully deleted group'), expect.any(Object));
        });

        it('should throw ForbiddenError if admin user lacks permission', async () => {
            await expect(service.deleteGroup(mockNonAdminUser, groupName))
                .rejects.toHaveProperty('statusCode', 403);
            expect(adapter.adminDeleteGroup).not.toHaveBeenCalled();
        });

        it('should re-throw ResourceNotFoundException from adapter', async () => {
            // Simulate adapter throwing mapped error
            const error = new BaseError('NotFoundError', 404, 'Group not found'); // Or specific ResourceNotFoundException if mapped
            adapter.adminDeleteGroup.mockRejectedValue(error);
            await expect(service.deleteGroup(mockAdminUser, groupName)).rejects.toThrow(error);
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('failed to delete group'), expect.objectContaining({ error }));
        });

        // Add test for re-throwing other adapter errors
    });
});