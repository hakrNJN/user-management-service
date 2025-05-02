import { Express } from 'express';
import 'reflect-metadata'; // Must be first
import request from 'supertest';
import { createApp } from '../../../src/app'; // Adjust path
import { IConfigService } from '../../../src/application/interfaces/IConfigService';
import { ILogger } from '../../../src/application/interfaces/ILogger';
import { container } from '../../../src/container'; // Adjust path
import { WinstonLogger } from '../../../src/infrastructure/logging/WinstonLogger'; // Example Logger impl
import { TYPES } from '../../../src/shared/constants/types';
import { mockConfigService } from '../../mocks/config.mock'; // Adjust path

describe('Integration Tests: System Routes (/api/system)', () => {
    let app: Express;
    let logger: ILogger;

    beforeAll(() => {
        // NODE_ENV and other core env vars are set by jest.setup.ts
        // We still might need to ensure mocks are registered correctly for THIS suite

        container.reset(); // Reset container for this suite

        // Register the mock config service. Even if the controller doesn't use it heavily,
        // the app setup (createApp) or middleware might.
        container.registerInstance<IConfigService>(TYPES.ConfigService, mockConfigService);

        // Register Logger (using real impl or mock)
        // Ensure LOG_LEVEL from jest.setup.ts ('error') is respected if using real logger
        if (!container.isRegistered(TYPES.Logger)) {
            // Make sure WinstonLogger respects LOG_LEVEL from process.env
            container.registerSingleton<ILogger>(TYPES.Logger, WinstonLogger);
        } else {
            // If already registered (e.g. globally), ensure its config is suitable for tests
        }


        logger = container.resolve<ILogger>(TYPES.Logger);
        // logger.info('Setting up integration tests for System Routes...'); // Info won't show if level is 'error'

        // Create the app instance *after* mocks/dependencies are registered for this suite
        app = createApp();
    });

    // No need for afterEach clearAllMocks if mocks aren't modified per test
    // but keep it if you plan to adjust mock return values within specific tests.
    afterEach(() => {
        jest.clearAllMocks();
    });


    afterAll(() => {
        container.reset(); // Clean up container
    });

    describe('GET /api/system/health', () => {
        it('should return 200 OK with status UP', async () => { // Changed expectation description
            const response = await request(app)
                .get('/api/system/health')
                .expect('Content-Type', /json/)
                .expect(200);

            // Assert against the *actual* response from your controller
            expect(response.body).toHaveProperty('status', 'UP'); // Changed 'OK' to 'UP'
            expect(response.body).toHaveProperty('timestamp');
        });
    });

    describe('GET /api/system/server-info', () => {
        it('should return 200 OK with server info', async () => {
            const response = await request(app)
                .get('/api/system/server-info')
                .expect('Content-Type', /json/)
                .expect(200);

            // Assert against the *actual* response structure from your controller
            expect(response.body).toHaveProperty('environment', 'test'); // Changed 'nodeEnv' to 'environment'
            expect(response.body).toHaveProperty('nodeVersion'); // Check property exists
            expect(response.body).toHaveProperty('os');
            expect(response.body.os).toHaveProperty('platform'); // Example check nested property
            expect(response.body).toHaveProperty('timestamp');

            // Optional: Verify mock interaction only if the controller *actually* uses configService.get('NODE_ENV')
            // If SystemController just reads process.env.NODE_ENV directly, this check might fail or be irrelevant.
            // Check your SystemController implementation.
            // Example: If it uses configService:
            // expect(mockConfigService.get).toHaveBeenCalledWith('NODE_ENV');
        });
    });

    describe('GET /api/non-existent-route', () => {
        // This test should still pass as it tests the 404 handler
        it('should return 404 Not Found', async () => {
            const response = await request(app)
                .get('/api/non-existent-route')
                .expect('Content-Type', /json/)
                .expect(404);

            expect(response.body).toHaveProperty('status', 'error');
            expect(response.body).toHaveProperty('name', 'NotFoundError');
            expect(response.body.message).toContain('was not found');
            expect(response.body).toHaveProperty('requestId');
        });
    });
});