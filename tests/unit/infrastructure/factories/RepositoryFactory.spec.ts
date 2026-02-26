import 'reflect-metadata';
import { RepositoryFactory } from '@src/infrastructure/factories/RepositoryFactory';

const makeMockRepo = () => ({ find: jest.fn(), findByName: jest.fn() });

const mockDynamo = makeMockRepo();
const mockFirestore = makeMockRepo();
const mockMongo = makeMockRepo();
const mockConfigService = { get: jest.fn(), getOrThrow: jest.fn(), getNumber: jest.fn(), getBoolean: jest.fn() };

describe('RepositoryFactory', () => {
    let factory: RepositoryFactory;

    beforeEach(() => {
        jest.clearAllMocks();
        factory = new RepositoryFactory(mockConfigService as any, mockDynamo as any, mockFirestore as any, mockMongo as any);
    });

    it('returns DynamoDB repo when DB_PROVIDER is DYNAMODB', () => {
        mockConfigService.get.mockReturnValue('DYNAMODB');
        expect(factory.getUserRepository()).toBe(mockDynamo);
    });

    it('returns DynamoDB repo by default when DB_PROVIDER is not set', () => {
        mockConfigService.get.mockReturnValue(undefined);
        expect(factory.getUserRepository()).toBe(mockDynamo);
    });

    it('returns Firestore repo when DB_PROVIDER is FIRESTORE', () => {
        mockConfigService.get.mockReturnValue('FIRESTORE');
        expect(factory.getUserRepository()).toBe(mockFirestore);
    });

    it('returns Mongo repo when DB_PROVIDER is MONGO', () => {
        mockConfigService.get.mockReturnValue('MONGO');
        expect(factory.getUserRepository()).toBe(mockMongo);
    });

    it('returns Mongo repo when DB_PROVIDER is AZURE_COSMOS', () => {
        mockConfigService.get.mockReturnValue('AZURE_COSMOS');
        expect(factory.getUserRepository()).toBe(mockMongo);
    });

    it('throws on unsupported DB_PROVIDER', () => {
        mockConfigService.get.mockReturnValue('CASSANDRA');
        expect(() => factory.getUserRepository()).toThrow('Unsupported DB_PROVIDER: CASSANDRA');
    });

    it('is case-insensitive for provider names', () => {
        mockConfigService.get.mockReturnValue('dynamodb');
        expect(factory.getUserRepository()).toBe(mockDynamo);
    });
});
