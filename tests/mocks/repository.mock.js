"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mockUserProfileRepository = exports.mockPolicyEngineAdapter = exports.mockPolicyRepository = exports.mockAssignmentRepository = exports.mockPermissionRepository = exports.mockRoleRepository = void 0;
exports.mockRoleRepository = {
    create: jest.fn(),
    findByName: jest.fn(),
    list: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
};
exports.mockPermissionRepository = {
    create: jest.fn(),
    findByName: jest.fn(),
    list: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
};
exports.mockAssignmentRepository = {
    findRolesByGroupName: jest.fn(),
    assignRoleToGroup: jest.fn(),
    removeRoleFromGroup: jest.fn(),
    findGroupsByRoleName: jest.fn(),
    findPermissionsByRoleName: jest.fn(),
    assignPermissionToRole: jest.fn(),
    removePermissionFromRole: jest.fn(),
    findRolesByPermissionName: jest.fn(),
    findCustomRolesByUserId: jest.fn(),
    assignCustomRoleToUser: jest.fn(),
    removeCustomRoleFromUser: jest.fn(),
    findCustomPermissionsByUserId: jest.fn(),
    assignCustomPermissionToUser: jest.fn(),
    removeCustomPermissionFromUser: jest.fn(),
    removeAllAssignmentsForUser: jest.fn(),
    removeAllAssignmentsForGroup: jest.fn(),
    removeAllAssignmentsForRole: jest.fn(),
    removeAllAssignmentsForPermission: jest.fn(),
};
exports.mockPolicyRepository = {
    save: jest.fn(),
    findById: jest.fn(),
    findByName: jest.fn(),
    list: jest.fn(),
    delete: jest.fn(),
    getPolicyVersion: jest.fn(),
    listPolicyVersions: jest.fn(),
    getAllPolicies: jest.fn(),
};
exports.mockPolicyEngineAdapter = {
    publishPolicy: jest.fn(),
    getPolicyDefinition: jest.fn(),
    deletePolicyDefinition: jest.fn(),
    validatePolicySyntax: jest.fn(),
};
exports.mockUserProfileRepository = {
    findById: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findByEmail: jest.fn(),
    findByPhoneNumber: jest.fn(),
    findByMfaStatus: jest.fn(),
};
