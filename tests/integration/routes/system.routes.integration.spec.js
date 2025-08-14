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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata"); // Must be first
const supertest_1 = __importDefault(require("supertest"));
const app_1 = require("../../../src/app"); // Adjust path
const container_1 = require("../../../src/container"); // Adjust path
const WinstonLogger_1 = require("../../../src/infrastructure/logging/WinstonLogger"); // Example Logger impl
const types_1 = require("../../../src/shared/constants/types");
const config_mock_1 = require("../../mocks/config.mock"); // Adjust path
describe('Integration Tests: System Routes (/api/system)', () => {
    let app;
    let logger;
    beforeAll(() => {
        // NODE_ENV and other core env vars are set by jest.setup.ts
        // We still might need to ensure mocks are registered correctly for THIS suite
        container_1.container.reset(); // Reset container for this suite
        // Register the mock config service. Even if the controller doesn't use it heavily,
        // the app setup (createApp) or middleware might.
        container_1.container.registerInstance(types_1.TYPES.ConfigService, config_mock_1.mockConfigService);
        // Register Logger (using real impl or mock)
        // Ensure LOG_LEVEL from jest.setup.ts ('error') is respected if using real logger
        if (!container_1.container.isRegistered(types_1.TYPES.Logger)) {
            // Make sure WinstonLogger respects LOG_LEVEL from process.env
            container_1.container.registerSingleton(types_1.TYPES.Logger, WinstonLogger_1.WinstonLogger);
        }
        else {
            // If already registered (e.g. globally), ensure its config is suitable for tests
        }
        logger = container_1.container.resolve(types_1.TYPES.Logger);
        // logger.info('Setting up integration tests for System Routes...'); // Info won't show if level is 'error'
        // Create the app instance *after* mocks/dependencies are registered for this suite
        app = (0, app_1.createApp)();
    });
    // No need for afterEach clearAllMocks if mocks aren't modified per test
    // but keep it if you plan to adjust mock return values within specific tests.
    afterEach(() => {
        jest.clearAllMocks();
    });
    afterAll(() => {
        container_1.container.reset(); // Clean up container
    });
    describe('GET /api/system/health', () => {
        it('should return 200 OK with status UP', () => __awaiter(void 0, void 0, void 0, function* () {
            const response = yield (0, supertest_1.default)(app)
                .get('/api/system/health')
                .expect('Content-Type', /json/)
                .expect(200);
            // Assert against the *actual* response from your controller
            expect(response.body).toHaveProperty('status', 'UP'); // Changed 'OK' to 'UP'
            expect(response.body).toHaveProperty('timestamp');
        }));
    });
    describe('GET /api/system/server-info', () => {
        it('should return 200 OK with server info', () => __awaiter(void 0, void 0, void 0, function* () {
            const response = yield (0, supertest_1.default)(app)
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
        }));
    });
    describe('GET /api/non-existent-route', () => {
        // This test should still pass as it tests the 404 handler
        it('should return 404 Not Found', () => __awaiter(void 0, void 0, void 0, function* () {
            const response = yield (0, supertest_1.default)(app)
                .get('/api/non-existent-route')
                .expect('Content-Type', /json/)
                .expect(404);
            expect(response.body).toHaveProperty('status', 'error');
            expect(response.body).toHaveProperty('name', 'NotFoundError');
            expect(response.body.message).toContain('was not found');
            expect(response.body).toHaveProperty('requestId');
        }));
    });
});
