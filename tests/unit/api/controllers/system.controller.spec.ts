// tests/unit/api/controllers/system.controller.spec.ts

import { NextFunction, Request, Response } from 'express';
import os from 'os';
import process from 'process';
import { SystemController } from '../../../../src/api/controllers/system.controller';
import { IConfigService } from '../../../../src/application/interfaces/IConfigService';
import { mockConfigService } from '../../../mocks/config.mock'; // Assuming common mock location

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
const originalProcessVersion = process.version; // Store original value
beforeAll(() => {
    // Mock process.version before tests run
    Object.defineProperty(process, 'version', { value: 'v16.0.0-mock', writable: true });
});
afterAll(() => {
     // Restore original process.version after tests
     Object.defineProperty(process, 'version', { value: originalProcessVersion, writable: true });
});
// --- End Mock Node.js Modules ---

describe('SystemController', () => {
    let controller: SystemController;
    let mockRequest: Partial<Request>;
    let mockResponse: Partial<Response>;
    let mockNext: NextFunction;
    let configService: jest.Mocked<IConfigService>;

    // Mocks for response methods
    let mockStatus: jest.Mock;
    let mockJson: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks(); // Clear all mocks including os/process mocks

        configService = { ...mockConfigService } as jest.Mocked<IConfigService>;
        controller = new SystemController(configService);

        mockRequest = {}; // No specific request properties needed
        mockJson = jest.fn();
        mockStatus = jest.fn(() => ({ json: mockJson })); // Chain status().json()
        mockResponse = {
            status: mockStatus,
        };
        mockNext = jest.fn();

        // Reset mocked os methods and provide return values
        (os.platform as jest.Mock).mockReturnValue('mockOS');
        (os.arch as jest.Mock).mockReturnValue('mockArch');
        (os.release as jest.Mock).mockReturnValue('mockRelease');

        // Reset config mock calls if needed
        configService.get.mockClear();
    });

    // --- Tests for getHealth ---
    describe('getHealth', () => {
        it('should return 200 status', () => {
            controller.getHealth(mockRequest as Request, mockResponse as Response, mockNext);
            expect(mockStatus).toHaveBeenCalledWith(200);
        });

        it('should return JSON with status UP and timestamp', () => {
            controller.getHealth(mockRequest as Request, mockResponse as Response, mockNext);
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
             controller.getHealth(mockRequest as Request, mockResponse as Response, mockNext);
             expect(mockNext).not.toHaveBeenCalled();
        });

        it('should call next() if res.json() throws', () => {
            const jsonError = new Error("Cannot stringify");
            mockJson.mockImplementation(() => { throw jsonError; });

            controller.getHealth(mockRequest as Request, mockResponse as Response, mockNext);

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
             configService.get.mockImplementation((key: string, defaultValue?: any) => {
                if (key === 'NODE_ENV') return testEnv;
                return defaultValue; // Default mock behavior for other keys
             });
         });

        it('should return 200 status', () => {
            controller.getServerInfo(mockRequest as Request, mockResponse as Response, mockNext);
            expect(mockStatus).toHaveBeenCalledWith(200);
        });

        it('should gather info from process, os, and config', () => {
            controller.getServerInfo(mockRequest as Request, mockResponse as Response, mockNext);

            expect(configService.get).toHaveBeenCalledWith('NODE_ENV', 'development'); // Verify config call
            expect(os.platform).toHaveBeenCalledTimes(1);
            expect(os.arch).toHaveBeenCalledTimes(1);
            expect(os.release).toHaveBeenCalledTimes(1);
            // No direct call to process.version, it's accessed as a property
        });

        it('should return expected server info structure in JSON', () => {
            controller.getServerInfo(mockRequest as Request, mockResponse as Response, mockNext);

            expect(mockJson).toHaveBeenCalledTimes(1);
            expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({
                nodeVersion: 'v16.0.0-mock', // From mocked process.version
                environment: testEnv,       // From mocked configService.get
                os: {
                    platform: 'mockOS',     // From mocked os.platform
                    arch: 'mockArch',         // From mocked os.arch
                    release: 'mockRelease',   // From mocked os.release
                },
                timestamp: expect.any(String),
            }));
            // Validate timestamp format roughly
            const responseArg = mockJson.mock.calls[0][0];
            expect(new Date(responseArg.timestamp)).not.toBeNaN();
        });

         it('should not call next() with an error', () => {
             controller.getServerInfo(mockRequest as Request, mockResponse as Response, mockNext);
             expect(mockNext).not.toHaveBeenCalled();
        });

        it('should call next() if an internal error occurs (e.g., os call fails)', () => {
            const osError = new Error("OS module error");
            (os.platform as jest.Mock).mockImplementation(() => { throw osError; });

            controller.getServerInfo(mockRequest as Request, mockResponse as Response, mockNext);

            expect(mockStatus).not.toHaveBeenCalled(); // Might not reach status setting
            expect(mockJson).not.toHaveBeenCalled();
            expect(mockNext).toHaveBeenCalledTimes(1);
            expect(mockNext).toHaveBeenCalledWith(osError);
        });
    });
});