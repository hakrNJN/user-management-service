import 'reflect-metadata';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
    PutItemCommand, GetItemCommand, QueryCommand, DeleteItemCommand
} from '@aws-sdk/client-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { marshall } from '@aws-sdk/util-dynamodb';
import { DynamoPolicyRepository } from '@src/infrastructure/persistence/dynamodb/DynamoPolicyRepository';
import { Policy } from '@src/domain/entities/Policy';
import { BaseError } from '@src/shared/errors/BaseError';

const ddbMock = mockClient(DynamoDBClient);

const mockLogger = { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
const mockConfigService = {
    get: jest.fn(), getOrThrow: jest.fn().mockReturnValue('TestTable'),
    getNumber: jest.fn(), getBoolean: jest.fn()
};
const ddbClientInstance = new DynamoDBClient({ region: 'local' });
const mockDynamoDBProvider = { client: ddbClientInstance, documentClient: {} as any };

const makePolicy = (overrides?: Partial<any>): Policy => new Policy(
    overrides?.tenantId ?? 'tenant-1',
    overrides?.id ?? 'policy-1',
    overrides?.policyName ?? 'AllowRead',
    overrides?.policyDefinition ?? 'package main\ndefault allow = false',
    overrides?.policyLanguage ?? 'rego',
    overrides?.version ?? 1,
    overrides?.description ?? 'A test policy',
    overrides?.metadata ?? {},
    overrides?.createdAt ?? new Date(),
    overrides?.updatedAt ?? new Date(),
    overrides?.isActive ?? true,
);

describe('DynamoPolicyRepository', () => {
    let repo: DynamoPolicyRepository;

    beforeEach(() => {
        ddbMock.reset();
        jest.clearAllMocks();
        repo = new DynamoPolicyRepository(mockConfigService as any, mockDynamoDBProvider as any, mockLogger as any);
    });

    describe('save()', () => {
        it('should save a policy successfully', async () => {
            ddbMock.on(PutItemCommand).resolves({});
            await repo.save(makePolicy());
            expect(ddbMock).toHaveReceivedCommand(PutItemCommand);
        });

        it('should throw BaseError on DDB error', async () => {
            ddbMock.on(PutItemCommand).rejects(new Error('DDB failed'));
            await expect(repo.save(makePolicy())).rejects.toBeInstanceOf(BaseError);
        });
    });

    describe('findById()', () => {
        it('should return null when not found', async () => {
            ddbMock.on(GetItemCommand).resolves({ Item: undefined });
            expect(await repo.findById('tenant-1', 'policy-1')).toBeNull();
        });

        it('should return a Policy when found', async () => {
            const item = marshall({
                PK: 'TENANT#tenant-1', SK: 'POLICY#policy-1',
                EntityType: 'Policy', tenantId: 'tenant-1', id: 'policy-1',
                policyName: 'AllowRead', policyDefinition: 'package main',
                policyLanguage: 'rego', version: 1, description: 'test',
                metadata: {}, isActive: true,
                createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
            });
            ddbMock.on(GetItemCommand).resolves({ Item: item });
            const result = await repo.findById('tenant-1', 'policy-1');
            expect(result).toBeInstanceOf(Policy);
            expect(result?.policyName).toBe('AllowRead');
        });

        it('should throw BaseError on DDB error', async () => {
            ddbMock.on(GetItemCommand).rejects(new Error('DDB Error'));
            await expect(repo.findById('tenant-1', 'policy-1')).rejects.toBeInstanceOf(BaseError);
        });
    });

    describe('findByName()', () => {
        it('should return null if no matching result', async () => {
            ddbMock.on(QueryCommand).resolves({ Items: [] });
            expect(await repo.findByName('tenant-1', 'NonExistent')).toBeNull();
        });

        it('should return a Policy when found by name', async () => {
            const item = marshall({
                PK: 'TENANT#tenant-1', SK: 'POLICY#policy-1',
                EntityType: 'Policy', tenantId: 'tenant-1', id: 'policy-1',
                policyName: 'AllowRead', policyDefinition: 'package main',
                policyLanguage: 'rego', version: 1, description: 'test',
                metadata: {}, isActive: true,
                createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
            });
            ddbMock.on(QueryCommand).resolves({ Items: [item] });
            const result = await repo.findByName('tenant-1', 'AllowRead');
            expect(result).toBeInstanceOf(Policy);
        });
    });

    describe('list()', () => {
        it('should return a list of policies', async () => {
            const item = marshall({
                PK: 'TENANT#tenant-1', SK: 'POLICY#policy-1',
                EntityType: 'Policy', tenantId: 'tenant-1', id: 'policy-1',
                policyName: 'AllowRead', policyDefinition: 'pkg main',
                policyLanguage: 'rego', version: 1,
                metadata: {}, isActive: true,
                createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
            });
            ddbMock.on(QueryCommand).resolves({ Items: [item] });
            const result = await repo.list('tenant-1');
            expect(result.items).toHaveLength(1);
        });

        it('should return empty when no items', async () => {
            ddbMock.on(QueryCommand).resolves({ Items: [] });
            const result = await repo.list('tenant-1');
            expect(result.items).toHaveLength(0);
        });
    });

    describe('delete()', () => {
        it('should return true when deleted successfully', async () => {
            ddbMock.on(DeleteItemCommand).resolves({});
            expect(await repo.delete('tenant-1', 'policy-1')).toBe(true);
        });

        it('should return false when policy not found (ConditionalCheckFailed)', async () => {
            const err: any = new Error('Condition');
            err.name = 'ConditionalCheckFailedException';
            ddbMock.on(DeleteItemCommand).rejects(err);
            expect(await repo.delete('tenant-1', 'ghost')).toBe(false);
        });

        it('should throw BaseError on generic error', async () => {
            ddbMock.on(DeleteItemCommand).rejects(new Error('DDB'));
            await expect(repo.delete('tenant-1', 'policy-1')).rejects.toBeInstanceOf(BaseError);
        });
    });
});
