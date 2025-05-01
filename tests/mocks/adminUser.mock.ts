import { AdminUser } from "../../src/shared/types/admin-user.interface";
export const mockAdminUser: AdminUser = {
    id: 'admin-test-user-id',
    username: 'test-admin',
    roles: ['admin'], // IMPORTANT: Assumes 'admin' is the required role
    attributes: { sub: 'admin-test-user-id' }
};
export const mockNonAdminUser: AdminUser = {
    id: 'non-admin-test-user-id',
    username: 'test-viewer',
    roles: ['viewer'], // User without 'admin' role
    attributes: { sub: 'non-admin-test-user-id' }
};