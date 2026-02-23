import 'reflect-metadata';
import { container } from 'tsyringe';
import { IConfigService } from '@src/application/interfaces/IConfigService';
import { ILogger } from '@src/application/interfaces/ILogger';
import { TYPES } from '@src/shared/constants/types';
import { DynamoDBProvider } from '@src/infrastructure/persistence/dynamodb/dynamodb.client';
import { loggerMock } from '../mocks/logger.mock';
import { mockConfigService } from '../mocks/config.mock';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import * as jwt from 'jsonwebtoken'; // Added

// Create a dedicated container for persistence tests to avoid polluting the global container
const persistenceContainer = container.createChildContainer();

// 1. Register Mocks for external services
persistenceContainer.register<ILogger>(TYPES.Logger, { useValue: loggerMock });

persistenceContainer.register<IConfigService>(TYPES.ConfigService, { useValue: mockConfigService });

// 3. Register the REAL DynamoDBProvider, but override its client with our shared test client
persistenceContainer.register<DynamoDBClient>(DynamoDBClient, {
  useFactory: (c) => {
    // Create a new client instance every time the provider is resolved
    const testDynamoDBClient = new DynamoDBClient({
      region: "ap-south-1", // Consistent with test files
    } as any);
    return testDynamoDBClient;
  },
});

persistenceContainer.register<DynamoDBProvider>(TYPES.DynamoDBProvider, {
  useFactory: (c) => new DynamoDBProvider(c.resolve(TYPES.ConfigService), c.resolve(DynamoDBClient))
});



export { persistenceContainer };

export async function getAdminToken(): Promise<string> {
  const payload = {
    sub: "admin-user-id",
    "cognito:groups": ["admin"],
    iss: `https://cognito-idp.${process.env.COGNITO_USER_POOL_ID?.split('_')[0]}.amazonaws.com/${process.env.COGNITO_USER_POOL_ID}`,
    token_use: "id",
    auth_time: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (60 * 60), // 1 hour from now
    iat: Math.floor(Date.now() / 1000),
    email: "admin@example.com"
  };
  // Use a dummy secret for testing
  return jwt.sign(payload, 'test-secret');
}

export async function getNonAdminToken(): Promise<string> {
  const payload = {
    sub: "non-admin-user-id",
    "cognito:groups": ["user"],
    iss: `https://cognito-idp.${process.env.COGNITO_USER_POOL_ID?.split('_')[0]}.amazonaws.com/${process.env.COGNITO_USER_POOL_ID}`,
    token_use: "id",
    auth_time: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (60 * 60), // 1 hour from now
    iat: Math.floor(Date.now() / 1000),
    email: "user@example.com"
  };
  // Use a dummy secret for testing
  return jwt.sign(payload, 'test-secret');
}
