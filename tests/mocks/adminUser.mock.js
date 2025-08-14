"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mockNonAdminUser = exports.mockAdminUser = void 0;
exports.mockAdminUser = {
    id: 'admin-test-user-id',
    username: 'test-admin',
    roles: ['admin'], // IMPORTANT: Assumes 'admin' is the required role
    attributes: { sub: 'admin-test-user-id' }
};
exports.mockNonAdminUser = {
    id: 'non-admin-test-user-id',
    username: 'test-viewer',
    roles: ['viewer'], // User without 'admin' role
    attributes: { sub: 'non-admin-test-user-id' }
};
