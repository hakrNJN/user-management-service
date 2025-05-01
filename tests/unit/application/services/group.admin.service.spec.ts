// tests/unit/application/services/group.admin.service.spec.ts

import { GroupType } from '@aws-sdk/client-cognito-identity-provider'; // Import SDK type and exception
import { ILogger } from '../../../../src/application/interfaces/ILogger';
import { CreateGroupDetails, IUserMgmtAdapter } from '../../../../src/application/interfaces/IUserMgmtAdapter';
import { GroupAdminService } from '../../../../src/application/services/group.admin.service';
import { Group } from '../../../../src/domain/entities/Group';
import { GroupExistsError } from '../../../../src/domain/exceptions/UserManagementError';
import { BaseError, NotFoundError } from '../../../../src/shared/errors/BaseError'; // Import NotFoundError if adapter maps to it
import { mockUserMgmtAdapter } from '../../../mocks/adapter.mock';
import { mockAdminUser, mockNonAdminUser } from '../../../mocks/adminUser.mock';
import { mockLogger } from '../../../mocks/logger.mock';

describe('GroupAdminService', () => {
    let service: GroupAdminService;
    let adapter: jest.Mocked<IUserMgmtAdapter>;
    let logger: jest.Mocked<ILogger>;

    beforeEach(() => {
        jest.clearAllMocks();
        adapter = { ...mockUserMgmtAdapter } as jest.Mocked<IUserMgmtAdapter>;
        logger = { ...mockLogger } as jest.Mocked<ILogger>;
        service = new GroupAdminService(adapter, logger);
    });

    // --- createGroup ---
    describe('createGroup', () => {
        const groupDetails: CreateGroupDetails = { groupName: 'new-group', description: 'A new group' };
        const mockCognitoGroup: GroupType = {
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
            expect(adapter.adminCreateGroup).toHaveBeenCalledWith(groupDetails);
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('attempting to create group'), expect.any(Object));
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('successfully created group'), expect.any(Object));
        });

        it('should throw ForbiddenError if admin user lacks permission', async () => {
            await expect(service.createGroup(mockNonAdminUser, groupDetails))
                .rejects.toThrow(BaseError); // Check for BaseError or specific ForbiddenError
            await expect(service.createGroup(mockNonAdminUser, groupDetails))
                .rejects.toHaveProperty('statusCode', 403);
            expect(adapter.adminCreateGroup).not.toHaveBeenCalled();
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Admin permission check failed'), expect.any(Object));
        });

        it('should re-throw GroupExistsError from adapter (if mapped)', async () => {
            // Assuming adapter maps GroupExistsException to domain GroupExistsError
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
        });

        it('should return null if adapter returns null (group not found)', async () => {
            adapter.adminGetGroup.mockResolvedValue(null);
            const result = await service.getGroup(mockAdminUser, groupName);
            expect(result).toBeNull();
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Group not found'), expect.any(Object));
        });

        it('should throw ForbiddenError if admin user lacks permission', async () => {
            await expect(service.getGroup(mockNonAdminUser, groupName))
                .rejects.toHaveProperty('statusCode', 403);
            expect(adapter.adminGetGroup).not.toHaveBeenCalled();
        });

        it('should re-throw errors from adapter', async () => {
            const error = new Error("Cognito internal error");
            adapter.adminGetGroup.mockRejectedValue(error);
            await expect(service.getGroup(mockAdminUser, groupName))
                .rejects.toThrow(error);
        });
    });

    // --- listGroups ---
    describe('listGroups', () => {
        const mockCognitoGroups: GroupType[] = [
            { GroupName: 'group1', UserPoolId: 'pool-id' }, { GroupName: 'group2', UserPoolId: 'pool-id' },
        ];

        it('should call adapter.adminListGroups and return mapped Groups and token', async () => {
            adapter.adminListGroups.mockResolvedValue({ groups: mockCognitoGroups, nextToken: 'token123' });
            const result = await service.listGroups(mockAdminUser, 10, 'startToken');
            expect(result.groups).toHaveLength(2);
            expect(result.groups[0]).toBeInstanceOf(Group);
            expect(result.nextToken).toBe('token123');
            expect(adapter.adminListGroups).toHaveBeenCalledWith(10, 'startToken');
        });

        it('should handle empty list from adapter', async () => {
            adapter.adminListGroups.mockResolvedValue({ groups: [], nextToken: undefined });
            const result = await service.listGroups(mockAdminUser);
            expect(result.groups).toHaveLength(0);
            expect(result.nextToken).toBeUndefined();
        });

        it('should throw ForbiddenError if admin user lacks permission', async () => {
            await expect(service.listGroups(mockNonAdminUser)).rejects.toHaveProperty('statusCode', 403);
            expect(adapter.adminListGroups).not.toHaveBeenCalled();
        });

        it('should re-throw errors from adapter', async () => {
            const error = new Error("Cognito list error");
            adapter.adminListGroups.mockRejectedValue(error);
            await expect(service.listGroups(mockAdminUser)).rejects.toThrow(error);
        });
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

        it('should re-throw NotFoundError from adapter (if mapped from ResourceNotFound)', async () => {
            // Simulate adapter throwing mapped error
            const error = new NotFoundError('Group'); // Assuming adapter maps ResourceNotFound to this
            adapter.adminDeleteGroup.mockRejectedValue(error);
            await expect(service.deleteGroup(mockAdminUser, groupName)).rejects.toThrow(NotFoundError);
        });

        it('should re-throw other errors from adapter', async () => {
            const error = new Error("Cognito delete error");
            adapter.adminDeleteGroup.mockRejectedValue(error);
            await expect(service.deleteGroup(mockAdminUser, groupName)).rejects.toThrow(error);
        });
    });
});