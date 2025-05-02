import { container } from 'tsyringe';
import { TYPES } from './shared/constants/types';

// --- Import Interfaces (Ports) ---
import { IConfigService } from './application/interfaces/IConfigService';
import { IGroupAdminService } from './application/interfaces/IGroupAdminService';
import { ILogger } from './application/interfaces/ILogger';
import { IUserAdminService } from './application/interfaces/IUserAdminService';
import { IUserMgmtAdapter } from './application/interfaces/IUserMgmtAdapter';

// --- Import Implementations (Adapters/Services/Infrastructure) ---
// Infrastructure
import { CognitoUserMgmtAdapter } from './infrastructure/adapters/cognito/CognitoUserMgmtAdapter';
import { EnvironmentConfigService } from './infrastructure/config/EnvironmentConfigService';
import { WinstonLogger } from './infrastructure/logging/WinstonLogger';
// Application Services
import { IAssignmentRepository } from './application/interfaces/IAssignmentRepository';
import { IPermissionAdminService } from './application/interfaces/IPermissionAdminService';
import { IPermissionRepository } from './application/interfaces/IPermissionRepository';
import { IRoleAdminService } from './application/interfaces/IRoleAdminService';
import { IRoleRepository } from './application/interfaces/IRoleRepository';
import { GroupAdminService } from './application/services/group.admin.service';
import { PermissionAdminService } from './application/services/permission.admin.service';
import { RoleAdminService } from './application/services/role.admin.service';
import { UserAdminService } from './application/services/user.admin.service';
import { DynamoAssignmentRepository } from './infrastructure/persistence/dynamodb/DynamoAssignmentRepository';
import { DynamoPermissionRepository } from './infrastructure/persistence/dynamodb/DynamoPermissionRepository';
import { DynamoRoleRepository } from './infrastructure/persistence/dynamodb/DynamoRoleRepository';
import { DynamoDBProvider } from './infrastructure/persistence/dynamodb/dynamodb.client';

// --- Register Infrastructure Services (Singletons recommended) ---
container.registerSingleton<ILogger>(TYPES.Logger, WinstonLogger);
container.registerSingleton<IConfigService>(TYPES.ConfigService, EnvironmentConfigService);

// --- Register Adapters (Singletons usually appropriate) ---
container.registerSingleton<IUserMgmtAdapter>(TYPES.UserMgmtAdapter, CognitoUserMgmtAdapter);

// --- Register Application Services (Singletons often suitable) ---
container.registerSingleton<IUserAdminService>(TYPES.UserAdminService, UserAdminService);
container.registerSingleton<IGroupAdminService>(TYPES.GroupAdminService, GroupAdminService);
container.registerSingleton<IPermissionAdminService>(TYPES.PermissionAdminService, PermissionAdminService );
container.registerSingleton<IRoleAdminService>(TYPES.RoleAdminService, RoleAdminService );

container.registerSingleton(TYPES.DynamoDBProvider,  DynamoDBProvider);
container.register<IAssignmentRepository>(TYPES.AssignmentRepository, DynamoAssignmentRepository)
container.register<IPermissionRepository>(TYPES.PermissionRepository, DynamoPermissionRepository)
container.register<IRoleRepository>(TYPES.RoleRepository, DynamoRoleRepository)

// --- Register Controllers (Usually Transient - handled automatically by tsyringe if decorated) ---
// container.register(TYPES.UserAdminController, UserAdminService)
// container.register(TYPES.SystemController, UserAdminService)
// container.register(TYPES.GroupAdminController, GroupAdminController)
// container.register(TYPES.RoleAdminController, RoleAdminController)
// container.register(TYPES.PermissionAdminController, PermissionAdminService)
// Ensure controllers are decorated with @injectable()
// No explicit registration needed here unless overriding behavior.
// import { UserAdminController } from './api/controllers/user.admin.controller';
// import { GroupAdminController } from './api/controllers/group.admin.controller';
// import { SystemController } from './api/controllers/system.controller';
// container.register(TYPES.UserAdminController, { useClass: UserAdminController }); // Example if needed

// Export the configured container
export { container };
