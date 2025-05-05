import {
    AttributeValue,
    ConditionalCheckFailedException,
    DeleteItemCommand,
    DynamoDBClient,
    GetItemCommand,
    PutItemCommand,
    ScanCommand
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest'; // Extends Jest expect
import 'reflect-metadata'; // Must be first

import { IConfigService } from '../../../../src/application/interfaces/IConfigService';
import { ILogger } from '../../../../src/application/interfaces/ILogger';
import { Policy } from '../../../../src/domain/entities/Policy';
import { DynamoDBProvider } from '../../../../src/infrastructure/persistence/dynamodb/dynamodb.client';
import { DynamoPolicyRepository } from '../../../../src/infrastructure/persistence/dynamodb/DynamoPolicyRepository'; // Adjust path
import { BaseError } from "../../../../src/shared/errors/BaseError";
import { mockConfigService } from '../../../mocks/config.mock';
import { mockLogger } from '../../../mocks/logger.mock';

// Mock the base DynamoDBClient provided by the provider
const ddbMock = mockClient(DynamoDBClient);

describe('DynamoPolicyRepository Unit Tests', () => {
    let repository: DynamoPolicyRepository;
    let configService: jest.Mocked<IConfigService>;
    let logger: jest.Mocked<ILogger>;
    const tableName = 'test-authz-table-policies';
    const testPolicyId = 'unit-policy-uuid-123';
    const testPolicyName = 'policy.unit.test';

    // Helper to create a valid Policy object for tests
    const createTestPolicy = (id = testPolicyId, name = testPolicyName) => {
        return new Policy(
            id,
            name,
            `package test.${name}\ndefault allow = false`,
            'rego',
            `Description for ${name}`,
            'v1.0',
            { owner: 'tester', tag: 'unit-test' }
        );
    };

    // Helper to create a marshalled DynamoDB item from a Policy
    const createDynamoItem = (policy: Policy): Record<string, AttributeValue> => {
        const item = {
            PK: `POLICY#${policy.id}`,
            SK: `POLICY#${policy.id}`,
            EntityType: 'Policy',
            ...policy.toPersistence(),
            // Add GSI keys if they were part of the model/implementation
            // EntityTypeGSI_PK: 'Policy',
            // EntityTypeGSI_SK: `POLICY#${policy.id}`,
        };
        return marshall(item, { removeUndefinedValues: true });
    };

    beforeEach(() => {
        ddbMock.reset();
        jest.clearAllMocks();

        configService = { ...mockConfigService } as jest.Mocked<IConfigService>;
        logger = { ...mockLogger } as jest.Mocked<ILogger>;

        // Configure mock config service for this repository
        configService.getOrThrow.mockImplementation((key: string): string => {
            if (key === 'AUTHZ_TABLE_NAME') return tableName;
            if (key === 'AWS_REGION') return 'us-east-1'; // Needed by provider
            throw new Error(`MockConfigService: Missing mock for required key "${key}"`);
        });

        // Instantiate the *real* provider and repository with mocks
        const provider = new DynamoDBProvider(configService);
        repository = new DynamoPolicyRepository(configService, logger, provider);
    });

    // --- Test mapToPolicy (Private Helper) ---
    describe('mapToPolicy (private)', () => {
        it('should correctly map a valid marshalled item', () => {
            const policy = createTestPolicy();
            const item = createDynamoItem(policy);
            const result = (repository as any).mapToPolicy(item); // Access private method
            expect(result).toBeInstanceOf(Policy);
            expect(result).toEqual(policy); // Check all properties match
        });

        it('should throw InvalidDataError if required fields are missing after unmarshall', () => {
            const invalidItem = marshall({ // Missing required fields like id, policyName etc.
                PK: `POLICY#${testPolicyId}`,
                SK: `POLICY#${testPolicyId}`,
                EntityType: 'Policy',
            });
            expect(() => (repository as any).mapToPolicy(invalidItem))
                .toThrow(/Invalid policy data retrieved from database/);
             expect(logger.error).toHaveBeenCalledWith(
                "Failed to map DynamoDB item to Policy entity",
                expect.objectContaining({ error: expect.stringContaining('Missing required fields') })
             );
        });
    });

    // --- Test createKey (Private Helper) ---
    describe('createKey (private)', () => {
        it('should return correctly marshalled PK/SK', () => {
            const expectedKey = marshall({ PK: `POLICY#${testPolicyId}`, SK: `POLICY#${testPolicyId}` });
            const result = (repository as any).createKey(testPolicyId);
            expect(result).toEqual(expectedKey);
        });
    });

    // --- Test save (handles create/update via PutItem) ---
    describe('save', () => {
        const policy = createTestPolicy();
        const expectedItem = createDynamoItem(policy);

        it('should send PutItemCommand with correct parameters', async () => {
            ddbMock.on(PutItemCommand).resolves({});
            await repository.save(policy);

            expect(ddbMock).toHaveReceivedCommandTimes(PutItemCommand, 1);
            expect(ddbMock).toHaveReceivedCommandWith(PutItemCommand, {
                TableName: tableName,
                Item: expectedItem,
                // No ConditionExpression in base save method
            });
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Policy saved/updated successfully: ${policy.policyName}`));
        });

        it('should throw DatabaseError on PutItem failure', async () => {
            const error = new Error('PutItem failed');
            ddbMock.on(PutItemCommand).rejects(error);

            await expect(repository.save(policy)).rejects.toThrow(BaseError);
            await expect(repository.save(policy)).rejects.toThrow(/Failed to save policy/);
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(`Error saving policy ${policy.policyName}`), error);
        });
    });

    // --- Test findById ---
    describe('findById', () => {
        const policy = createTestPolicy();
        const item = createDynamoItem(policy);
        const expectedKey = { PK: `POLICY#${policy.id}`, SK: `POLICY#${policy.id}` };

        it('should return the Policy if found', async () => {
            ddbMock.on(GetItemCommand).resolves({ Item: item });
            const result = await repository.findById(policy.id);
            expect(result).toEqual(policy);
            expect(ddbMock).toHaveReceivedCommandWith(GetItemCommand, { TableName: tableName, Key: marshall(expectedKey) });
        });

        it('should return null if item not found', async () => {
            ddbMock.on(GetItemCommand).resolves({ Item: undefined });
            const result = await repository.findById(policy.id);
            expect(result).toBeNull();
            expect(ddbMock).toHaveReceivedCommandWith(GetItemCommand, { Key: marshall(expectedKey) });
        });

        it('should throw DatabaseError on GetItem failure', async () => {
            const error = new Error('GetItem failed');
            ddbMock.on(GetItemCommand).rejects(error);
            await expect(repository.findById(policy.id)).rejects.toThrow(BaseError);
            await expect(repository.findById(policy.id)).rejects.toThrow(/Failed to find policy by ID/);
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(`Error finding policy by ID ${policy.id}`), error);
        });

        it('should throw InvalidDataError if found item is invalid', async () => {
            const invalidItem = marshall({ PK: `POLICY#${policy.id}`, SK: `POLICY#${policy.id}` }); // Missing fields
             ddbMock.on(GetItemCommand).resolves({ Item: invalidItem });
             await expect(repository.findById(policy.id)).rejects.toThrow(BaseError);
             await expect(repository.findById(policy.id)).rejects.toThrow(/Invalid policy data retrieved from database/);
        });
    });

    // --- Test findByName (using Scan) ---
    // TODO: Update these tests when findByName is implemented with GSI + Query
    describe('findByName (using Scan)', () => {
        const policy = createTestPolicy();
        const item = createDynamoItem(policy);

        it('should return the Policy if found via Scan', async () => {
            ddbMock.on(ScanCommand).resolves({ Items: [item], Count: 1 });
            const result = await repository.findByName(policy.policyName);
            expect(result).toEqual(policy);
            expect(ddbMock).toHaveReceivedCommandWith(ScanCommand, {
                TableName: tableName,
                FilterExpression: "EntityType = :type AND policyName = :name",
                ExpressionAttributeValues: marshall({ ":type": "Policy", ":name": policy.policyName }),
                Limit: 1,
            });
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Finding policy by name using Scan'));
        });

        it('should return null if not found via Scan', async () => {
             ddbMock.on(ScanCommand).resolves({ Items: [], Count: 0 });
             const result = await repository.findByName(policy.policyName);
             expect(result).toBeNull();
        });

        it('should return first item and log error if multiple found via Scan', async () => {
            const policy2 = createTestPolicy('id-2', policy.policyName); // Same name, different ID
            const item2 = createDynamoItem(policy2);
             ddbMock.on(ScanCommand).resolves({ Items: [item, item2], Count: 2 });
             const result = await repository.findByName(policy.policyName);
             expect(result).toEqual(policy); // Returns the first one
             expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(`Inconsistency: Found multiple policies with the name ${policy.policyName}`));
        });

         it('should throw DatabaseError on Scan failure', async () => {
            const error = new Error('Scan failed');
            ddbMock.on(ScanCommand).rejects(error);
            await expect(repository.findByName(policy.policyName)).rejects.toThrow(BaseError);
            await expect(repository.findByName(policy.policyName)).rejects.toThrow(/Failed to find policy by name/);
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(`Error finding policy by name ${policy.policyName} using Scan`), error);
        });
    });

     // --- Test list (using Scan) ---
     // TODO: Update these tests when list is implemented with GSI + Query
    describe('list (using Scan)', () => {
        const policy1 = createTestPolicy('id-1', 'policy.list.1');
        const policy2 = createTestPolicy('id-2', 'policy.list.2'); // Different language
        const item1 = createDynamoItem(policy1);
        const item2 = createDynamoItem(policy2);
        const mockLek = marshall({ PK: `POLICY#${policy2.id}`, SK: `POLICY#${policy2.id}` });

        it('should return policies and LEK if found via Scan', async () => {
             ddbMock.on(ScanCommand).resolves({ Items: [item1, item2], LastEvaluatedKey: mockLek });
             const result = await repository.list({ limit: 5 });
             expect(result.items).toHaveLength(2);
             expect(result.items).toEqual([policy1, policy2]);
             expect(result.lastEvaluatedKey).toEqual(unmarshall(mockLek)); // Repo returns unmarshalled key structure
             expect(ddbMock).toHaveReceivedCommandWith(ScanCommand, {
                 TableName: tableName,
                 FilterExpression: "EntityType = :type",
                 ExpressionAttributeValues: marshall({ ":type": "Policy" }),
                 Limit: 5,
                 ExclusiveStartKey: undefined
             });
             expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Listing policies using Scan operation'));
        });

        it('should filter by language if provided', async () => {
            ddbMock.on(ScanCommand).resolves({ Items: [item1] }); // Assume only rego policy returned
            const options = { language: 'rego' };
            const result = await repository.list(options);
            expect(result.items).toHaveLength(1);
            expect(result.items[0].policyName).toBe(policy1.policyName);
             expect(ddbMock).toHaveReceivedCommandWith(ScanCommand, {
                 TableName: tableName,
                 FilterExpression: "EntityType = :type AND policyLanguage = :lang",
                 ExpressionAttributeValues: marshall({ ":type": "Policy", ":lang": "rego" }),
                 Limit: undefined,
                 ExclusiveStartKey: undefined
             });
        });

        it('should pass ExclusiveStartKey if provided', async () => {
             ddbMock.on(ScanCommand).resolves({ Items: [] }); // No more items
             const lekForInput = { PK: { S: 'POLICY#id-1' }, SK: { S: 'POLICY#id-1' } }; // Key needs to be structured for SDK
             const result = await repository.list({ startKey: lekForInput });
             expect(result.items).toHaveLength(0);
             expect(ddbMock).toHaveReceivedCommandWith(ScanCommand, {
                 ExclusiveStartKey: lekForInput
             });
        });

        it('should handle empty results', async () => {
            ddbMock.on(ScanCommand).resolves({ Items: [] });
            const result = await repository.list();
            expect(result.items).toEqual([]);
            expect(result.lastEvaluatedKey).toBeUndefined();
        });

         it('should throw DatabaseError on Scan failure', async () => {
            const error = new Error('Scan failed');
            ddbMock.on(ScanCommand).rejects(error);
            await expect(repository.list()).rejects.toThrow(BaseError);
            await expect(repository.list()).rejects.toThrow(/Failed to list policies/);
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(`Error listing policies using Scan`), error);
        });
    });

    // --- Test delete ---
    describe('delete', () => {
        const policy = createTestPolicy();
        const expectedKey = { PK: `POLICY#${policy.id}`, SK: `POLICY#${policy.id}` };

        it('should return true on successful deletion', async () => {
            ddbMock.on(DeleteItemCommand).resolves({});
            const result = await repository.delete(policy.id);
            expect(result).toBe(true);
            expect(ddbMock).toHaveReceivedCommandWith(DeleteItemCommand, {
                TableName: tableName,
                Key: marshall(expectedKey),
                ConditionExpression: 'attribute_exists(PK)',
            });
            expect(logger.info).toHaveBeenCalledWith(`Policy deleted successfully: ID ${policy.id}`);
        });

        it('should return false if ConditionalCheckFailedException occurs (not found)', async () => {
            const error = new ConditionalCheckFailedException({ message: '', $metadata: {} });
            ddbMock.on(DeleteItemCommand).rejects(error);
            const result = await repository.delete(policy.id);
            expect(result).toBe(false);
            expect(logger.warn).toHaveBeenCalledWith(`Failed to delete policy ID ${policy.id}, not found.`);
        });

        it('should throw DatabaseError on other DeleteItem failure', async () => {
            const error = new Error('DeleteItem failed');
            ddbMock.on(DeleteItemCommand).rejects(error);
            await expect(repository.delete(policy.id)).rejects.toThrow(BaseError);
            await expect(repository.delete(policy.id)).rejects.toThrow(/Failed to delete policy/);
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(`Error deleting policy ID ${policy.id}`), error);
        });
    });
});