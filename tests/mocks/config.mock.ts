import { IConfigService } from '../../src/application/interfaces/IConfigService';
import { mock, MockProxy } from 'jest-mock-extended';

export const mockConfigService: MockProxy<IConfigService> = mock<IConfigService>();

(mockConfigService.get as jest.Mock<any, any>).mockImplementation((key: string, defaultValue?: any) => {
    switch (key) {
        case 'NODE_ENV': return 'test';
        case 'CORS_ORIGIN': return '*';
        case 'DYNAMODB_ENDPOINT_URL': return process.env.DYNAMODB_ENDPOINT_URL || "http://localhost:8000";
        case 'AWS_REGION': return "ap-south-1";
        case 'AUTHZ_TABLE_NAME':
            // Determine the correct table name based on the context or a global test state
            // For now, we'll assume a default if not specifically overridden in a test's DI setup
            return 'TestAuthzTable'; // This will be overridden by individual test files
        default: return defaultValue;
    }
});

(mockConfigService.getOrThrow as jest.Mock<any, any>).mockImplementation((key: string) => {
    switch (key) {
        case 'AUTHZ_TABLE_NAME':
            // This is the critical part: return the correct table name based on the test context
            // Since we are using separate tables for each repository, we need to return the correct one
            // This mock will be overridden in each test file's beforeAll block
            return 'TestAuthzTable'; // Default, will be overridden
        case 'AWS_REGION': return 'ap-south-1';
        case 'COGNITO_USER_POOL_ID': return 'test-user-pool-id';
        case 'COGNITO_CLIENT_ID': return 'test-client-id';
        case 'AWS_ACCESS_KEY_ID': return 'test';
        case 'AWS_SECRET_ACCESS_KEY': return 'test';
        case 'NODE_ENV': return 'test';
        case 'PORT': return '3000';
        case 'LOG_LEVEL': return 'info';
        case 'DYNAMODB_ENDPOINT_URL': return 'http://localhost:8000';
        default: throw new Error(`Config key ${key} not mocked and has no default.`);
    }
});