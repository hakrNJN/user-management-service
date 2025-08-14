"use strict";
// tests/unit/api/controllers/system.controller.spec.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const os_1 = __importDefault(require("os"));
const process_1 = __importDefault(require("process"));
const system_controller_1 = require("../../../../src/api/controllers/system.controller");
const config_mock_1 = require("../../../mocks/config.mock"); // Assuming common mock location
// --- Mock Node.js Modules ---
// We only need to mock the specific methods used by the controller
jest.mock('os', () => ({
    platform: jest.fn(),
    arch: jest.fn(),
    release: jest.fn(),
    // totalmem: jest.fn(), // Mock if used
    // freemem: jest.fn(), // Mock if used
}));
// Mock process properties (less common to mock 'process' directly, but needed here)
const originalProcessVersion = process_1.default.version; // Store original value
beforeAll(() => {
    // Mock process.version before tests run
    Object.defineProperty(process_1.default, 'version', { value: 'v16.0.0-mock', writable: true });
});
afterAll(() => {
    // Restore original process.version after tests
    Object.defineProperty(process_1.default, 'version', { value: originalProcessVersion, writable: true });
});
// --- End Mock Node.js Modules ---
describe('SystemController', () => {
    let controller;
    let mockRequest;
    let mockResponse;
    let mockNext;
    let configService;
    // Mocks for response methods
    let mockStatus;
    let mockJson;
    beforeEach(() => {
        jest.clearAllMocks(); // Clear all mocks including os/process mocks
        configService = Object.assign({}, config_mock_1.mockConfigService);
        controller = new system_controller_1.SystemController(configService);
        mockRequest = {}; // No specific request properties needed
        mockJson = jest.fn();
        mockStatus = jest.fn(() => ({ json: mockJson })); // Chain status().json()
        mockResponse = {
            status: mockStatus,
        };
        mockNext = jest.fn();
        // Reset mocked os methods and provide return values
        os_1.default.platform.mockReturnValue('mockOS');
        os_1.default.arch.mockReturnValue('mockArch');
        os_1.default.release.mockReturnValue('mockRelease');
        // Reset config mock calls if needed
        configService.get.mockClear();
    });
    // --- Tests for getHealth ---
    describe('getHealth', () => {
        it('should return 200 status', () => {
            controller.getHealth(mockRequest, mockResponse, mockNext);
            expect(mockStatus).toHaveBeenCalledWith(200);
        });
        it('should return JSON with status UP and timestamp', () => {
            controller.getHealth(mockRequest, mockResponse, mockNext);
            expect(mockJson).toHaveBeenCalledTimes(1);
            expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({
                status: 'UP',
                timestamp: expect.any(String), // Check for ISO string format
            }));
            // Validate timestamp format roughly
            const responseArg = mockJson.mock.calls[0][0];
            expect(new Date(responseArg.timestamp)).not.toBeNaN(); // Check if it's a valid date
        });
        it('should not call next() with an error', () => {
            controller.getHealth(mockRequest, mockResponse, mockNext);
            expect(mockNext).not.toHaveBeenCalled();
        });
        it('should call next() if res.json() throws', () => {
            const jsonError = new Error("Cannot stringify");
            mockJson.mockImplementation(() => { throw jsonError; });
            controller.getHealth(mockRequest, mockResponse, mockNext);
            expect(mockStatus).toHaveBeenCalledWith(200); // Status might still be set
            expect(mockNext).toHaveBeenCalledTimes(1);
            expect(mockNext).toHaveBeenCalledWith(jsonError);
        });
    });
    // --- Tests for getServerInfo ---
    describe('getServerInfo', () => {
        const testEnv = 'test-environment';
        beforeEach(() => {
            // Setup config mock specifically for NODE_ENV
            configService.get.mockImplementation((key, defaultValue) => {
                if (key === 'NODE_ENV')
                    return testEnv;
                return defaultValue; // Default mock behavior for other keys
            });
        });
        it('should return 200 status', () => {
            controller.getServerInfo(mockRequest, mockResponse, mockNext);
            expect(mockStatus).toHaveBeenCalledWith(200);
        });
        it('should gather info from process, os, and config', () => {
            controller.getServerInfo(mockRequest, mockResponse, mockNext);
            expect(configService.get).toHaveBeenCalledWith('NODE_ENV', 'development'); // Verify config call
            expect(os_1.default.platform).toHaveBeenCalledTimes(1);
            expect(os_1.default.arch).toHaveBeenCalledTimes(1);
            expect(os_1.default.release).toHaveBeenCalledTimes(1);
            // No direct call to process.version, it's accessed as a property
        });
        it('should return expected server info structure in JSON', () => {
            controller.getServerInfo(mockRequest, mockResponse, mockNext);
            expect(mockJson).toHaveBeenCalledTimes(1);
            expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({
                nodeVersion: 'v16.0.0-mock', // From mocked process.version
                environment: testEnv, // From mocked configService.get
                os: {
                    platform: 'mockOS', // From mocked os.platform
                    arch: 'mockArch', // From mocked os.arch
                    release: 'mockRelease', // From mocked os.release
                },
                timestamp: expect.any(String),
            }));
            // Validate timestamp format roughly
            const responseArg = mockJson.mock.calls[0][0];
            expect(new Date(responseArg.timestamp)).not.toBeNaN();
        });
        it('should not call next() with an error', () => {
            controller.getServerInfo(mockRequest, mockResponse, mockNext);
            expect(mockNext).not.toHaveBeenCalled();
        });
        it('should call next() if an internal error occurs (e.g., os call fails)', () => {
            const osError = new Error("OS module error");
            os_1.default.platform.mockImplementation(() => { throw osError; });
            controller.getServerInfo(mockRequest, mockResponse, mockNext);
            expect(mockStatus).not.toHaveBeenCalled(); // Might not reach status setting
            expect(mockJson).not.toHaveBeenCalled();
            expect(mockNext).toHaveBeenCalledTimes(1);
            expect(mockNext).toHaveBeenCalledWith(osError);
        });
    });
});
