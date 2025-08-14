"use strict";
// tests/jest.setup.ts
Object.defineProperty(exports, "__esModule", { value: true });
// Ensure reflect-metadata is loaded FIRST for tsyringe DI
require("reflect-metadata");
// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.PORT = '3001'; // Use a different port than default dev maybe
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'warn'; // Allow overriding via runner, default to warn/error for tests
// --- Core Application Config ---
process.env.AUTHZ_TABLE_NAME = process.env.AUTHZ_TABLE_NAME || 'user-mgmt-authz-test'; // Table for Roles/Perms/Policies/Assignments
process.env.CORS_ORIGIN = '*'; // Usually permissive for tests
// --- AWS / Cognito / IdP Config (TEST VALUES) ---
process.env.AWS_REGION = process.env.AWS_REGION || 'us-east-1'; // Or mock region
process.env.COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || 'us-east-1_testPoolId999';
process.env.COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID || 'test-client-id-abc';
// Use distinct URLs for test issuer/jwks to avoid accidental real calls if mocks fail
process.env.COGNITO_ISSUER = process.env.COGNITO_ISSUER || 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_testPoolId999'; // Match pool ID
process.env.COGNITO_JWKS_URI = process.env.COGNITO_JWKS_URI || `https://cognito-idp.us-east-1.amazonaws.com/${process.env.COGNITO_USER_POOL_ID}/.well-known/jwks.json`;
// --- DynamoDB Local Config ---
// Use localhost typically for unit/integration tests unless using AWS mocks entirely
process.env.DYNAMODB_ENDPOINT_URL = process.env.DYNAMODB_ENDPOINT_URL || 'http://localhost:8000';
// Optional: Dummy credentials needed if not using default provider chain (e.g., for DynamoDB Local)
process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || 'test-key-id';
process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || 'test-secret-key';
// --- Test Specific Config ---
// Flag to enable the test token bypass in admin.auth.guard.middleware
// Set this to 'true' explicitly if your tests rely on the bypass token
process.env.TEST_AUTH_BYPASS_ENABLED = process.env.TEST_AUTH_BYPASS_ENABLED || 'true'; // Default to true for typical test runs
// --- Jest Global Settings ---
jest.setTimeout(15000); // Default timeout per test (adjust as needed, e.g., longer for integration)
// --- Global Mocks / Setup ---
beforeEach(() => {
    // Clear all mocks defined using jest.fn(), jest.spyOn(), etc.
    // This helps ensure tests don't interfere with each other's mock states.
    jest.clearAllMocks();
    // Optional: Reset environment variables if tests modify them
    // process.env = { ...originalEnv }; // Requires storing originalEnv beforehand
});
// --- Optional: Global Setup/Teardown (if using Jest's globalSetup/globalTeardown config) ---
// import { createTestTable, deleteTestTable } from './helpers/dynamodb.helper'; // Adjust path
// export default async () => {
//   console.log('\nJest Global Setup: Starting...');
//   // Setup resources like DynamoDB Local table
//   await createTestTable();
//   console.log('Jest Global Setup: Complete.');
// };
// export default async () => {
//   console.log('\nJest Global Teardown: Starting...');
//   // Teardown resources
//   await deleteTestTable();
//   console.log('Jest Global Teardown: Complete.');
// };
console.log(`Jest Setup: Running tests in NODE_ENV='${process.env.NODE_ENV}'`);
console.log(`Jest Setup: Test Auth Bypass Enabled: ${process.env.TEST_AUTH_BYPASS_ENABLED}`);
