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

process.env.COGNITO_JWKS_URI='https://cognito-idp.your-region.amazonaws.com/your_test_pool_id/.well-known/jwks.json'
process.env.COGNITO_ISSUER='https://cognito-idp.your-region.amazonaws.com/your_test_pool_id'

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

// Make sure reflect-metadata is imported for tsyringe if used in setup/teardown
import 'reflect-metadata';

// Global setup/teardown using beforeAll/afterAll if run within Jest directly
// If using globalSetup/Teardown, move this logic there.
// beforeAll(async () => {
//     console.log('Jest Setup: Creating test table...');
//     await createTestTable();
//     console.log('Jest Setup: Test table ready.');
// }, 60000); // Increase timeout for table creation

// afterAll(async () => {
//     console.log('Jest Teardown: Deleting test table...');
//     await deleteTestTable();
//     console.log('Jest Teardown: Test table deleted.');
// }, 120000); // Increase timeout for table deletion
