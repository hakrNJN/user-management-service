"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mockPolicyEngineAdapter = exports.mockUserMgmtAdapter = void 0;
exports.mockUserMgmtAdapter = {
    adminCreateUser: jest.fn(),
    adminGetUser: jest.fn(),
    adminUpdateUserAttributes: jest.fn(),
    adminDeleteUser: jest.fn(),
    adminDisableUser: jest.fn(),
    adminEnableUser: jest.fn(),
    adminInitiatePasswordReset: jest.fn(),
    adminSetUserPassword: jest.fn(),
    adminAddUserToGroup: jest.fn(),
    adminRemoveUserFromGroup: jest.fn(),
    adminListGroupsForUser: jest.fn(),
    adminListUsers: jest.fn(),
    adminListUsersInGroup: jest.fn(),
    // Group methods for GroupAdminService tests
    adminCreateGroup: jest.fn(),
    adminDeleteGroup: jest.fn(),
    adminGetGroup: jest.fn(),
    adminListGroups: jest.fn(),
    adminReactivateGroup: jest.fn(),
};
exports.mockPolicyEngineAdapter = {
    publishPolicy: jest.fn(),
    getPolicyDefinition: jest.fn(),
    deletePolicyDefinition: jest.fn(),
    validatePolicySyntax: jest.fn(),
    // listPolicyDefinitions: jest.fn(), // Uncomment if using optional method
};
