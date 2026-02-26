import 'reflect-metadata';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
    PutItemCommand, GetItemCommand, QueryCommand, UpdateItemCommand, DeleteItemCommand
} from '@aws-sdk/client-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { marshall } from '@aws-sdk/util-dynamodb';
import { DynamoRoleRepository } from '@src/infrastructure/persistence/dynamodb/DynamoRoleRepository';
import { Role } from '@src/domain/entities/Role';
import { BaseError } from '@src/shared/errors/BaseError';
import { RoleExistsError } from '@src/domain/exceptions/UserManagementError';

const ddbMock = mockClient(DynamoDBClient);

const mockLogger = { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
const mockConfigService = { get: jest.fn(), getOrThrow: jest.fn().mockReturnValue('TestTable'), getNumber: jest.fn(), getBoolean: jest.fn() };
const ddbClientInstance = new DynamoDBClient({ region: 'local' });

const makeRole = (overrides?: Partial<any>): Role => Role.fromPersistence({
    tenantId: 'tenant-1',
    roleName: 'admin',
    description: 'Admin role',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
});

describe('DynamoRoleRepository', () => {
    let repo: DynamoRoleRepository;

    beforeEach(() => {
        ddbMock.reset();
        jest.clearAllMocks();
        repo = new DynamoRoleRepository(mockConfigService as any, mockLogger as any, ddbClientInstance);
    });

    describe('create()', () => {
        it('should put the item and log success', async () => {
            ddbMock.on(PutItemCommand).resolves({});
            const role = makeRole();
            await repo.create(role);
            expect(ddbMock).toHaveReceivedCommand(PutItemCommand);
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Role created successfully'));
        });

        it('should throw RoleExistsError on ConditionalCheckFailedException', async () => {
            const err: any = new Error('Conditional check failed');
            err.name = 'ConditionalCheckFailedException';
            ddbMock.on(PutItemCommand).rejects(err);
            const role = makeRole();
            await expect(repo.create(role)).rejects.toBeInstanceOf(RoleExistsError);
        });

        it('should throw BaseError on generic DynamoDB error', async () => {
            ddbMock.on(PutItemCommand).rejects(new Error('DDB failed'));
            await expect(repo.create(makeRole())).rejects.toBeInstanceOf(BaseError);
        });
    });

    describe('findByName()', () => {
        it('should return null when item not found', async () => {
            ddbMock.on(GetItemCommand).resolves({ Item: undefined });
            const result = await repo.findByName('tenant-1', 'admin');
            expect(result).toBeNull();
        });

        it('should return a Role when item is found', async () => {
            const item = marshall({
                PK: 'TENANT#tenant-1', SK: 'ROLE#admin', EntityType: 'Role',
                tenantId: 'tenant-1', roleName: 'admin', description: 'Admin role',
                createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
            });
            ddbMock.on(GetItemCommand).resolves({ Item: item });
            const result = await repo.findByName('tenant-1', 'admin');
            expect(result).toBeInstanceOf(Role);
            expect(result?.roleName).toBe('admin');
        });

        it('should throw BaseError on DynamoDB error', async () => {
            ddbMock.on(GetItemCommand).rejects(new Error('DDB Error'));
            await expect(repo.findByName('tenant-1', 'admin')).rejects.toBeInstanceOf(BaseError);
        });
    });

    describe('list()', () => {
        it('should return a list of roles', async () => {
            const item = marshall({
                PK: 'TENANT#tenant-1', SK: 'ROLE#admin', EntityType: 'Role',
                tenantId: 'tenant-1', roleName: 'admin', description: 'Admin role',
                createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
            });
            ddbMock.on(QueryCommand).resolves({ Items: [item] });
            const result = await repo.list('tenant-1');
            expect(result.items).toHaveLength(1);
            expect(result.items[0]).toBeInstanceOf(Role);
        });

        it('should return empty list when no items found', async () => {
            ddbMock.on(QueryCommand).resolves({ Items: [] });
            const result = await repo.list('tenant-1');
            expect(result.items).toHaveLength(0);
        });

        it('should throw BaseError on DynamoDB error', async () => {
            ddbMock.on(QueryCommand).rejects(new Error('DDB Error'));
            await expect(repo.list('tenant-1')).rejects.toBeInstanceOf(BaseError);
        });
    });

    describe('update()', () => {
        it('should update a role and return it', async () => {
            const attrs = marshall({
                PK: 'TENANT#tenant-1', SK: 'ROLE#admin', EntityType: 'Role',
                tenantId: 'tenant-1', roleName: 'admin', description: 'Updated',
                createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
            });
            ddbMock.on(UpdateItemCommand).resolves({ Attributes: attrs });
            const result = await repo.update('tenant-1', 'admin', { description: 'Updated' });
            expect(result?.description).toBe('Updated');
        });

        it('should return null when role not found (ConditionalCheckFailed)', async () => {
            const err: any = new Error('Conditional check failed');
            err.name = 'ConditionalCheckFailedException';
            ddbMock.on(UpdateItemCommand).rejects(err);
            const result = await repo.update('tenant-1', 'ghost', { description: 'x' });
            expect(result).toBeNull();
        });

        it('should throw BaseError on generic DDB error', async () => {
            ddbMock.on(UpdateItemCommand).rejects(new Error('DDB Error'));
            await expect(repo.update('tenant-1', 'admin', {})).rejects.toBeInstanceOf(BaseError);
        });
    });

    describe('delete()', () => {
        it('should return true when role deleted successfully', async () => {
            ddbMock.on(DeleteItemCommand).resolves({});
            const result = await repo.delete('tenant-1', 'admin');
            expect(result).toBe(true);
        });

        it('should return false when role not found (ConditionalCheckFailed)', async () => {
            const err: any = new Error('Conditional check failed');
            err.name = 'ConditionalCheckFailedException';
            ddbMock.on(DeleteItemCommand).rejects(err);
            const result = await repo.delete('tenant-1', 'ghost');
            expect(result).toBe(false);
        });

        it('should throw BaseError on generic DDB error', async () => {
            ddbMock.on(DeleteItemCommand).rejects(new Error('DDB Error'));
            await expect(repo.delete('tenant-1', 'admin')).rejects.toBeInstanceOf(BaseError);
        });
    });
});
