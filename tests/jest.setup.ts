// Jest global setup for all tests

// Ensure reflect-metadata is loaded for tsyringe DI
import 'reflect-metadata';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.PORT = '3000';
process.env.LOG_LEVEL = 'error';

// AWS and Cognito Configuration
process.env.AWS_REGION = 'us-east-1';
process.env.COGNITO_USER_POOL_ID = 'us-east-1_test';
process.env.COGNITO_CLIENT_ID = 'test-client-id';

// DynamoDB Local Configuration
process.env.DYNAMODB_ENDPOINT_URL = 'http://localhost:8000';
process.env.DYNAMODB_TABLE_PREFIX = 'test_';
process.env.USER_PROFILES_TABLE = 'user_profiles';

// JWT Configuration for e2e tests
process.env.JWT_SECRET = 'test-secret';

// Set test timeouts
jest.setTimeout(30000); // 30 seconds

// Clear all mocks before each test
beforeEach(() => {
    jest.clearAllMocks();
});