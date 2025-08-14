"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const util_dynamodb_1 = require("@aws-sdk/util-dynamodb");
const aws_sdk_client_mock_1 = require("aws-sdk-client-mock");
require("aws-sdk-client-mock-jest"); // Extends Jest expect
require("reflect-metadata"); // Must be first
const Policy_1 = require("../../../../src/domain/entities/Policy");
const dynamodb_client_1 = require("../../../../src/infrastructure/persistence/dynamodb/dynamodb.client");
const DynamoPolicyRepository_1 = require("../../../../src/infrastructure/persistence/dynamodb/DynamoPolicyRepository"); // Adjust path
const BaseError_1 = require("../../../../src/shared/errors/BaseError");
const config_mock_1 = require("../../../mocks/config.mock");
const logger_mock_1 = require("../../../mocks/logger.mock");
// Mock the base DynamoDBClient provided by the provider
const ddbMock = (0, aws_sdk_client_mock_1.mockClient)(client_dynamodb_1.DynamoDBClient);
describe('DynamoPolicyRepository Unit Tests', () => {
    let repository;
    let configService;
    let logger;
    const tableName = 'test-authz-table-policies';
    const testPolicyId = 'unit-policy-uuid-123';
    const testPolicyName = 'policy.unit.test';
    // Helper to create a valid Policy object for tests
    const createTestPolicy = (id = testPolicyId, name = testPolicyName) => {
        return new Policy_1.Policy(id, name, `package test.${name}\ndefault allow = false`, 'rego', 1, // version
        `Description for ${name}`, { owner: 'tester', tag: 'unit-test' });
    };
    // Helper to create a marshalled DynamoDB item from a Policy
    const createDynamoItem = (policy) => {
        const item = Object.assign({ PK: `POLICY#${policy.id}`, SK: `POLICY#${policy.id}`, EntityType: 'Policy' }, policy.toPersistence());
        return (0, util_dynamodb_1.marshall)(item, { removeUndefinedValues: true });
    };
    beforeEach(() => {
        ddbMock.reset();
        jest.clearAllMocks();
        configService = Object.assign({}, config_mock_1.mockConfigService);
        logger = Object.assign({}, logger_mock_1.mockLogger);
        // Configure mock config service for this repository
        configService.getOrThrow.mockImplementation((key) => {
            if (key === 'AUTHZ_TABLE_NAME')
                return tableName;
            if (key === 'AWS_REGION')
                return 'us-east-1'; // Needed by provider
            throw new Error(`MockConfigService: Missing mock for required key "${key}"`);
        });
        // Instantiate the *real* provider and repository with mocks
        const provider = new dynamodb_client_1.DynamoDBProvider(configService);
        repository = new DynamoPolicyRepository_1.DynamoPolicyRepository(provider, logger);
    });
    // --- Test mapToPolicy (Private Helper) ---
    describe('mapToPolicy (private)', () => {
        it('should correctly map a valid marshalled item', () => {
            const policy = createTestPolicy();
            const item = createDynamoItem(policy);
            const result = repository.mapToPolicy(item); // Access private method
            expect(result).toBeInstanceOf(Policy_1.Policy);
            expect(result).toEqual(policy); // Check all properties match
        });
        it('should throw InvalidDataError if required fields are missing after unmarshall', () => {
            const invalidItem = (0, util_dynamodb_1.marshall)({
                PK: `POLICY#${testPolicyId}`,
                SK: `POLICY#${testPolicyId}`,
                EntityType: 'Policy',
            });
            expect(() => repository.mapToPolicy(invalidItem))
                .toThrow(/Invalid policy data retrieved from database/);
            expect(logger.error).toHaveBeenCalledWith("Failed to map DynamoDB item to Policy entity", expect.objectContaining({ error: expect.stringContaining('Missing required fields') }));
        });
    });
    // --- Test createKey (Private Helper) ---
    describe('createKey (private)', () => {
        it('should return correctly marshalled PK/SK', () => {
            const expectedKey = (0, util_dynamodb_1.marshall)({ PK: `POLICY#${testPolicyId}`, SK: `POLICY#${testPolicyId}` });
            const result = repository.createKey(testPolicyId);
            expect(result).toEqual(expectedKey);
        });
    });
    // --- Test save (handles create/update via PutItem) ---
    describe('save', () => {
        const policy = createTestPolicy();
        const expectedItem = createDynamoItem(policy);
        it('should send PutItemCommand with correct parameters', () => __awaiter(void 0, void 0, void 0, function* () {
            ddbMock.on(client_dynamodb_1.PutItemCommand).resolves({});
            yield repository.save(policy);
            expect(ddbMock).toHaveReceivedCommandTimes(client_dynamodb_1.PutItemCommand, 1);
            expect(ddbMock).toHaveReceivedCommandWith(client_dynamodb_1.PutItemCommand, {
                TableName: tableName,
                Item: expectedItem,
                // No ConditionExpression in base save method
            });
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Policy saved/updated successfully: ${policy.policyName}`));
        }));
        it('should throw DatabaseError on PutItem failure', () => __awaiter(void 0, void 0, void 0, function* () {
            const error = new Error('PutItem failed');
            ddbMock.on(client_dynamodb_1.PutItemCommand).rejects(error);
            yield expect(repository.save(policy)).rejects.toThrow(BaseError_1.BaseError);
            yield expect(repository.save(policy)).rejects.toThrow(/Failed to save policy/);
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(`Error saving policy ${policy.policyName}`), error);
        }));
    });
    // --- Test findById ---
    describe('findById', () => {
        const policy = createTestPolicy();
        const item = createDynamoItem(policy);
        const expectedKey = { PK: `POLICY#${policy.id}`, SK: `POLICY#${policy.id}` };
        it('should return the Policy if found', () => __awaiter(void 0, void 0, void 0, function* () {
            ddbMock.on(client_dynamodb_1.GetItemCommand).resolves({ Item: item });
            const result = yield repository.findById(policy.id);
            expect(result).toEqual(policy);
            expect(ddbMock).toHaveReceivedCommandWith(client_dynamodb_1.GetItemCommand, { TableName: tableName, Key: (0, util_dynamodb_1.marshall)(expectedKey) });
        }));
        it('should return null if item not found', () => __awaiter(void 0, void 0, void 0, function* () {
            ddbMock.on(client_dynamodb_1.GetItemCommand).resolves({ Item: undefined });
            const result = yield repository.findById(policy.id);
            expect(result).toBeNull();
            expect(ddbMock).toHaveReceivedCommandWith(client_dynamodb_1.GetItemCommand, { Key: (0, util_dynamodb_1.marshall)(expectedKey) });
        }));
        it('should throw DatabaseError on GetItem failure', () => __awaiter(void 0, void 0, void 0, function* () {
            const error = new Error('GetItem failed');
            ddbMock.on(client_dynamodb_1.GetItemCommand).rejects(error);
            yield expect(repository.findById(policy.id)).rejects.toThrow(BaseError_1.BaseError);
            yield expect(repository.findById(policy.id)).rejects.toThrow(/Failed to find policy by ID/);
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(`Error finding policy by ID ${policy.id}`), error);
        }));
        it('should throw InvalidDataError if found item is invalid', () => __awaiter(void 0, void 0, void 0, function* () {
            const invalidItem = (0, util_dynamodb_1.marshall)({ PK: `POLICY#${policy.id}`, SK: `POLICY#${policy.id}` }); // Missing fields
            ddbMock.on(client_dynamodb_1.GetItemCommand).resolves({ Item: invalidItem });
            yield expect(repository.findById(policy.id)).rejects.toThrow(BaseError_1.BaseError);
            yield expect(repository.findById(policy.id)).rejects.toThrow(/Invalid policy data retrieved from database/);
        }));
    });
    // --- Test findByName (using Scan) ---
    // TODO: Update these tests when findByName is implemented with GSI + Query
    describe('findByName (using Scan)', () => {
        const policy = createTestPolicy();
        const item = createDynamoItem(policy);
        it('should return the Policy if found via Scan', () => __awaiter(void 0, void 0, void 0, function* () {
            ddbMock.on(client_dynamodb_1.ScanCommand).resolves({ Items: [item], Count: 1 });
            const result = yield repository.findByName(policy.policyName);
            expect(result).toEqual(policy);
            expect(ddbMock).toHaveReceivedCommandWith(client_dynamodb_1.ScanCommand, {
                TableName: tableName,
                FilterExpression: "EntityType = :type AND policyName = :name",
                ExpressionAttributeValues: (0, util_dynamodb_1.marshall)({ ":type": "Policy", ":name": policy.policyName }),
                Limit: 1,
            });
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Finding policy by name using Scan'));
        }));
        it('should return null if not found via Scan', () => __awaiter(void 0, void 0, void 0, function* () {
            ddbMock.on(client_dynamodb_1.ScanCommand).resolves({ Items: [], Count: 0 });
            const result = yield repository.findByName(policy.policyName);
            expect(result).toBeNull();
        }));
        it('should return first item and log error if multiple found via Scan', () => __awaiter(void 0, void 0, void 0, function* () {
            const policy2 = createTestPolicy('id-2', policy.policyName); // Same name, different ID
            const item2 = createDynamoItem(policy2);
            ddbMock.on(client_dynamodb_1.ScanCommand).resolves({ Items: [item, item2], Count: 2 });
            const result = yield repository.findByName(policy.policyName);
            expect(result).toEqual(policy); // Returns the first one
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(`Inconsistency: Found multiple policies with the name ${policy.policyName}`));
        }));
        it('should throw DatabaseError on Scan failure', () => __awaiter(void 0, void 0, void 0, function* () {
            const error = new Error('Scan failed');
            ddbMock.on(client_dynamodb_1.ScanCommand).rejects(error);
            yield expect(repository.findByName(policy.policyName)).rejects.toThrow(BaseError_1.BaseError);
            yield expect(repository.findByName(policy.policyName)).rejects.toThrow(/Failed to find policy by name/);
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(`Error finding policy by name ${policy.policyName} using Scan`), error);
        }));
    });
    // --- Test list (using Scan) ---
    // TODO: Update these tests when list is implemented with GSI + Query
    describe('list (using Scan)', () => {
        const policy1 = createTestPolicy('id-1', 'policy.list.1');
        const policy2 = createTestPolicy('id-2', 'policy.list.2'); // Different language
        const item1 = createDynamoItem(policy1);
        const item2 = createDynamoItem(policy2);
        const mockLek = (0, util_dynamodb_1.marshall)({ PK: `POLICY#${policy2.id}`, SK: `POLICY#${policy2.id}` });
        it('should return policies and LEK if found via Scan', () => __awaiter(void 0, void 0, void 0, function* () {
            ddbMock.on(client_dynamodb_1.ScanCommand).resolves({ Items: [item1, item2], LastEvaluatedKey: mockLek });
            const result = yield repository.list({ limit: 5 });
            expect(result.items).toHaveLength(2);
            expect(result.items).toEqual([policy1, policy2]);
            expect(result.lastEvaluatedKey).toEqual((0, util_dynamodb_1.unmarshall)(mockLek)); // Repo returns unmarshalled key structure
            expect(ddbMock).toHaveReceivedCommandWith(client_dynamodb_1.ScanCommand, {
                TableName: tableName,
                FilterExpression: "EntityType = :type",
                ExpressionAttributeValues: (0, util_dynamodb_1.marshall)({ ":type": "Policy" }),
                Limit: 5,
                ExclusiveStartKey: undefined
            });
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Listing policies using Scan operation'));
        }));
        it('should filter by language if provided', () => __awaiter(void 0, void 0, void 0, function* () {
            ddbMock.on(client_dynamodb_1.ScanCommand).resolves({ Items: [item1] }); // Assume only rego policy returned
            const options = { language: 'rego' };
            const result = yield repository.list(options);
            expect(result.items).toHaveLength(1);
            expect(result.items[0].policyName).toBe(policy1.policyName);
            expect(ddbMock).toHaveReceivedCommandWith(client_dynamodb_1.ScanCommand, {
                TableName: tableName,
                FilterExpression: "EntityType = :type AND policyLanguage = :lang",
                ExpressionAttributeValues: (0, util_dynamodb_1.marshall)({ ":type": "Policy", ":lang": "rego" }),
                Limit: undefined,
                ExclusiveStartKey: undefined
            });
        }));
        it('should pass ExclusiveStartKey if provided', () => __awaiter(void 0, void 0, void 0, function* () {
            ddbMock.on(client_dynamodb_1.ScanCommand).resolves({ Items: [] }); // No more items
            const lekForInput = { PK: { S: 'POLICY#id-1' }, SK: { S: 'POLICY#id-1' } }; // Key needs to be structured for SDK
            const result = yield repository.list({ startKey: lekForInput });
            expect(result.items).toHaveLength(0);
            expect(ddbMock).toHaveReceivedCommandWith(client_dynamodb_1.ScanCommand, {
                ExclusiveStartKey: lekForInput
            });
        }));
        it('should handle empty results', () => __awaiter(void 0, void 0, void 0, function* () {
            ddbMock.on(client_dynamodb_1.ScanCommand).resolves({ Items: [] });
            const result = yield repository.list();
            expect(result.items).toEqual([]);
            expect(result.lastEvaluatedKey).toBeUndefined();
        }));
        it('should throw DatabaseError on Scan failure', () => __awaiter(void 0, void 0, void 0, function* () {
            const error = new Error('Scan failed');
            ddbMock.on(client_dynamodb_1.ScanCommand).rejects(error);
            yield expect(repository.list()).rejects.toThrow(BaseError_1.BaseError);
            yield expect(repository.list()).rejects.toThrow(/Failed to list policies/);
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(`Error listing policies using Scan`), error);
        }));
    });
    // --- Test delete ---
    describe('delete', () => {
        const policy = createTestPolicy();
        const expectedKey = { PK: `POLICY#${policy.id}`, SK: `POLICY#${policy.id}` };
        it('should return true on successful deletion', () => __awaiter(void 0, void 0, void 0, function* () {
            ddbMock.on(client_dynamodb_1.DeleteItemCommand).resolves({});
            const result = yield repository.delete(policy.id);
            expect(result).toBe(true);
            expect(ddbMock).toHaveReceivedCommandWith(client_dynamodb_1.DeleteItemCommand, {
                TableName: tableName,
                Key: (0, util_dynamodb_1.marshall)(expectedKey),
                ConditionExpression: 'attribute_exists(PK)',
            });
            expect(logger.info).toHaveBeenCalledWith(`Policy deleted successfully: ID ${policy.id}`);
        }));
        it('should return false if ConditionalCheckFailedException occurs (not found)', () => __awaiter(void 0, void 0, void 0, function* () {
            const error = new client_dynamodb_1.ConditionalCheckFailedException({ message: '', $metadata: {} });
            ddbMock.on(client_dynamodb_1.DeleteItemCommand).rejects(error);
            const result = yield repository.delete(policy.id);
            expect(result).toBe(false);
            expect(logger.warn).toHaveBeenCalledWith(`Failed to delete policy ID ${policy.id}, not found.`);
        }));
        it('should throw DatabaseError on other DeleteItem failure', () => __awaiter(void 0, void 0, void 0, function* () {
            const error = new Error('DeleteItem failed');
            ddbMock.on(client_dynamodb_1.DeleteItemCommand).rejects(error);
            yield expect(repository.delete(policy.id)).rejects.toThrow(BaseError_1.BaseError);
            yield expect(repository.delete(policy.id)).rejects.toThrow(/Failed to delete policy/);
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(`Error deleting policy ID ${policy.id}`), error);
        }));
    });
});
