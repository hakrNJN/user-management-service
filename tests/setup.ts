import 'reflect-metadata';
import { container } from 'tsyringe';
import { TYPES } from '@src/shared/constants/types';
import { loggerMock } from './mocks/logger.mock';
import { userMgmtAdapterMock } from './mocks/userMgmtAdapter.mock';
import { policyRepositoryMock } from './mocks/policyRepository.mock';
import { assignmentRepositoryMock } from './mocks/assignmentRepository.mock';
import { roleRepositoryMock } from './mocks/roleRepository.mock';
import { permissionRepositoryMock } from './mocks/permissionRepository.mock';
import { policyEngineAdapterMock } from './mocks/policyEngineAdapter.mock';
import { policyAdminServiceMock } from './mocks/policyAdminService.mock';
import { groupAdminServiceMock } from './mocks/groupAdminService.mock';
import { userAdminServiceMock } from './mocks/userAdminService.mock';
import { mockReset } from 'jest-mock-extended';

// Register mocks
container.register(TYPES.Logger, { useValue: loggerMock });
container.register(TYPES.UserMgmtAdapter, { useValue: userMgmtAdapterMock });
container.register(TYPES.PolicyRepository, { useValue: policyRepositoryMock });
container.register(TYPES.AssignmentRepository, { useValue: assignmentRepositoryMock });
container.register(TYPES.RoleRepository, { useValue: roleRepositoryMock });
container.register(TYPES.PermissionRepository, { useValue: permissionRepositoryMock });
container.register(TYPES.PolicyEngineAdapter, { useValue: policyEngineAdapterMock });
container.register(TYPES.PolicyAdminService, { useValue: policyAdminServiceMock });
container.register(TYPES.GroupAdminService, { useValue: groupAdminServiceMock });
container.register(TYPES.UserAdminService, { useValue: userAdminServiceMock });

// Reset mocks before each test
beforeEach(() => {
    mockReset(loggerMock);
    mockReset(userMgmtAdapterMock);
    mockReset(policyRepositoryMock);
    mockReset(assignmentRepositoryMock);
    mockReset(roleRepositoryMock);
    mockReset(permissionRepositoryMock);
    mockReset(policyEngineAdapterMock);
    mockReset(policyAdminServiceMock);
    mockReset(groupAdminServiceMock);
    mockReset(userAdminServiceMock);
});