// tests/mocks/logger.mock.ts
import { ILogger } from "../../src/application/interfaces/ILogger";

export const mockLogger: jest.Mocked<ILogger> = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
};
