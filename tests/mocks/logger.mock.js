"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mockLogger = void 0;
exports.mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
};
