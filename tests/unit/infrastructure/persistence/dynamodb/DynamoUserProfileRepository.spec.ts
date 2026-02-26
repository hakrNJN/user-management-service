import 'reflect-metadata';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoUserProfileRepository } from '@src/infrastructure/persistence/dynamodb/DynamoUserProfileRepository';
import { UserProfile } from '@src/domain/entities/UserProfile';
import { BaseError } from '@src/shared/errors/BaseError';
import { UserProfileExistsError } from '@src/domain/exceptions/UserManagementError';

const ddbDocMock = mockClient(DynamoDBDocumentClient);

const mockLogger = { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
const mockConfigService = {
    get: jest.fn(), getOrThrow: jest.fn().mockReturnValue('TestTable'),
    getNumber: jest.fn(), getBoolean: jest.fn()
};

const underlyingClient = new DynamoDBClient({ region: 'local' });
const docClient = DynamoDBDocumentClient.from(underlyingClient);
const mockDynamoDBProvider = { client: underlyingClient, documentClient: docClient };

const makeProfile = (overrides?: Partial<any>): UserProfile => UserProfile.fromPersistence({
    userId: 'user-1',
    tenantId: 'tenant-1',
    email: 'user@test.com',
    firstName: 'John',
    lastName: 'Doe',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
});

describe('DynamoUserProfileRepository', () => {
    let repo: DynamoUserProfileRepository;

    beforeEach(() => {
        ddbDocMock.reset();
        jest.clearAllMocks();
        repo = new DynamoUserProfileRepository(
            mockDynamoDBProvider as any,
            mockLogger as any,
            mockConfigService as any
        );
    });

    describe('save()', () => {
        it('should save a user profile successfully', async () => {
            ddbDocMock.on(PutCommand).resolves({});
            await repo.save(makeProfile());
            expect(ddbDocMock).toHaveReceivedCommand(PutCommand);
        });

        it('should throw UserProfileExistsError on ConditionalCheckFailedException', async () => {
            const err: any = new Error('Conditional check failed');
            err.name = 'ConditionalCheckFailedException';
            ddbDocMock.on(PutCommand).rejects(err);
            await expect(repo.save(makeProfile())).rejects.toBeInstanceOf(UserProfileExistsError);
        });

        it('should throw BaseError on generic DDB error', async () => {
            ddbDocMock.on(PutCommand).rejects(new Error('DDB failed'));
            await expect(repo.save(makeProfile())).rejects.toBeInstanceOf(BaseError);
        });
    });

    describe('findById()', () => {
        it('should return null when user not found', async () => {
            ddbDocMock.on(GetCommand).resolves({ Item: undefined });
            expect(await repo.findById('tenant-1', 'user-1')).toBeNull();
        });

        it('should return UserProfile when found', async () => {
            ddbDocMock.on(GetCommand).resolves({
                Item: {
                    userId: 'user-1', tenantId: 'tenant-1', email: 'u@t.com',
                    firstName: 'John', lastName: 'Doe',
                    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
                }
            });
            const result = await repo.findById('tenant-1', 'user-1');
            expect(result).toBeInstanceOf(UserProfile);
        });
    });

    describe('findByEmail()', () => {
        it('should return null when no items found', async () => {
            ddbDocMock.on(QueryCommand).resolves({ Items: [] });
            expect(await repo.findByEmail('tenant-1', 'test@test.com')).toBeNull();
        });

        it('should return UserProfile when found by email', async () => {
            ddbDocMock.on(QueryCommand).resolves({
                Items: [{
                    userId: 'user-1', tenantId: 'tenant-1', email: 'test@test.com',
                    firstName: 'John', lastName: 'Doe',
                    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
                }]
            });
            const result = await repo.findByEmail('tenant-1', 'test@test.com');
            expect(result).toBeInstanceOf(UserProfile);
        });
    });

    describe('update()', () => {
        it('should return null on ConditionalCheckFailedException', async () => {
            const err: any = new Error('Conditional check failed');
            err.name = 'ConditionalCheckFailedException';
            ddbDocMock.on(UpdateCommand).rejects(err);
            expect(await repo.update('tenant-1', 'ghost', { firstName: 'x' })).toBeNull();
            expect(mockLogger.warn).toHaveBeenCalled();
        });

        it('should throw BaseError on generic DDB error', async () => {
            ddbDocMock.on(UpdateCommand).rejects(new Error('DDB Error'));
            await expect(repo.update('tenant-1', 'user-1', { firstName: 'x' })).rejects.toBeInstanceOf(BaseError);
        });

        it('should return updated profile on success', async () => {
            ddbDocMock.on(UpdateCommand).resolves({
                Attributes: {
                    userId: 'user-1', tenantId: 'tenant-1', email: 'u@t.com',
                    firstName: 'Jane', lastName: 'Doe',
                    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
                }
            });
            const result = await repo.update('tenant-1', 'user-1', { firstName: 'Jane' });
            expect(result?.firstName).toBe('Jane');
        });
    });

    describe('delete()', () => {
        it('should return true on successful delete', async () => {
            ddbDocMock.on(DeleteCommand).resolves({});
            expect(await repo.delete('tenant-1', 'user-1')).toBe(true);
        });
    });

    describe('findAll()', () => {
        it('should return list of user profiles', async () => {
            ddbDocMock.on(QueryCommand).resolves({
                Items: [{
                    userId: 'user-1', tenantId: 'tenant-1', email: 'u@t.com',
                    firstName: 'John', lastName: 'Doe',
                    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
                }]
            });
            const result = await repo.findAll('tenant-1');
            expect(result).toHaveLength(1);
            expect(result[0]).toBeInstanceOf(UserProfile);
        });

        it('should return empty array when no users found', async () => {
            ddbDocMock.on(QueryCommand).resolves({ Items: undefined });
            const result = await repo.findAll('tenant-1');
            expect(result).toHaveLength(0);
        });
    });
});
