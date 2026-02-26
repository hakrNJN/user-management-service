import 'reflect-metadata';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
    PutItemCommand, GetItemCommand, QueryCommand, UpdateItemCommand, DeleteItemCommand
} from '@aws-sdk/client-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { marshall } from '@aws-sdk/util-dynamodb';
import { DynamoPermissionRepository } from '@src/infrastructure/persistence/dynamodb/DynamoPermissionRepository';
import { Permission } from '@src/domain/entities/Permission';
import { BaseError } from '@src/shared/errors/BaseError';
import { PermissionExistsError } from '@src/domain/exceptions/UserManagementError';

const ddbMock = mockClient(DynamoDBClient);

const mockLogger = { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
const mockConfigService = { get: jest.fn(), getOrThrow: jest.fn().mockReturnValue('TestTable'), getNumber: jest.fn(), getBoolean: jest.fn() };
const mockDynamoDBProvider = {
    client: new DynamoDBClient({ region: 'local' }),
    documentClient: {} as any,
};

const makePermission = (overrides?: Partial<any>): Permission => Permission.fromPersistence({
    tenantId: 'tenant-1',
    permissionName: 'read:users',
    description: 'Read users permission',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
});

describe('DynamoPermissionRepository', () => {
    let repo: DynamoPermissionRepository;

    beforeEach(() => {
        ddbMock.reset();
        jest.clearAllMocks();
        repo = new DynamoPermissionRepository(
            mockConfigService as any,
            mockLogger as any,
            mockDynamoDBProvider as any
        );
    });

    describe('create()', () => {
        it('should create a permission successfully', async () => {
            ddbMock.on(PutItemCommand).resolves({});
            await repo.create(makePermission());
            expect(ddbMock).toHaveReceivedCommand(PutItemCommand);
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Permission created'));
        });

        it('should throw PermissionExistsError on ConditionalCheckFailedException', async () => {
            const err: any = new Error('Condition failed');
            err.name = 'ConditionalCheckFailedException';
            ddbMock.on(PutItemCommand).rejects(err);
            await expect(repo.create(makePermission())).rejects.toBeInstanceOf(PermissionExistsError);
        });

        it('should throw BaseError on generic DDB error', async () => {
            ddbMock.on(PutItemCommand).rejects(new Error('DDB failed'));
            await expect(repo.create(makePermission())).rejects.toBeInstanceOf(BaseError);
        });
    });

    describe('findByName()', () => {
        it('should return null when item not found', async () => {
            ddbMock.on(GetItemCommand).resolves({ Item: undefined });
            expect(await repo.findByName('tenant-1', 'read:users')).toBeNull();
        });

        it('should return a Permission when found', async () => {
            const item = marshall({
                PK: 'TENANT#tenant-1', SK: 'PERMISSION#read:users',
                EntityType: 'Permission', tenantId: 'tenant-1',
                permissionName: 'read:users', description: 'Read users permission',
                createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
            });
            ddbMock.on(GetItemCommand).resolves({ Item: item });
            const result = await repo.findByName('tenant-1', 'read:users');
            expect(result).toBeInstanceOf(Permission);
            expect(result?.permissionName).toBe('read:users');
        });

        it('should throw BaseError on DDB error', async () => {
            ddbMock.on(GetItemCommand).rejects(new Error('DDB Error'));
            await expect(repo.findByName('tenant-1', 'read:users')).rejects.toBeInstanceOf(BaseError);
        });
    });

    describe('list()', () => {
        it('should return list of permissions', async () => {
            const item = marshall({
                PK: 'TENANT#tenant-1', SK: 'PERMISSION#read:users',
                EntityType: 'Permission', tenantId: 'tenant-1',
                permissionName: 'read:users', description: 'Read users permission',
                createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
            });
            ddbMock.on(QueryCommand).resolves({ Items: [item] });
            const result = await repo.list('tenant-1');
            expect(result.items).toHaveLength(1);
        });

        it('should return empty list when no items found', async () => {
            ddbMock.on(QueryCommand).resolves({ Items: [] });
            const result = await repo.list('tenant-1');
            expect(result.items).toHaveLength(0);
        });

        it('should throw BaseError on DDB error', async () => {
            ddbMock.on(QueryCommand).rejects(new Error('DDB Error'));
            await expect(repo.list('tenant-1')).rejects.toBeInstanceOf(BaseError);
        });
    });

    describe('update()', () => {
        it('should update and return permission', async () => {
            const attrs = marshall({
                PK: 'TENANT#tenant-1', SK: 'PERMISSION#read:users',
                EntityType: 'Permission', tenantId: 'tenant-1',
                permissionName: 'read:users', description: 'Updated',
                createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
            });
            ddbMock.on(UpdateItemCommand).resolves({ Attributes: attrs });
            const result = await repo.update('tenant-1', 'read:users', { description: 'Updated' });
            expect(result?.description).toBe('Updated');
        });

        it('should return null on ConditionalCheckFailed', async () => {
            const err: any = new Error('Condition');
            err.name = 'ConditionalCheckFailedException';
            ddbMock.on(UpdateItemCommand).rejects(err);
            expect(await repo.update('tenant-1', 'none', {})).toBeNull();
        });

        it('should throw BaseError on generic error', async () => {
            ddbMock.on(UpdateItemCommand).rejects(new Error('DDB'));
            await expect(repo.update('tenant-1', 'read:users', {})).rejects.toBeInstanceOf(BaseError);
        });
    });

    describe('delete()', () => {
        it('should return true on success', async () => {
            ddbMock.on(DeleteItemCommand).resolves({});
            expect(await repo.delete('tenant-1', 'read:users')).toBe(true);
        });

        it('should return false on ConditionalCheckFailed', async () => {
            const err: any = new Error('Condition');
            err.name = 'ConditionalCheckFailedException';
            ddbMock.on(DeleteItemCommand).rejects(err);
            expect(await repo.delete('tenant-1', 'ghost')).toBe(false);
        });

        it('should throw BaseError on generic error', async () => {
            ddbMock.on(DeleteItemCommand).rejects(new Error('DDB'));
            await expect(repo.delete('tenant-1', 'read:users')).rejects.toBeInstanceOf(BaseError);
        });
    });
});
