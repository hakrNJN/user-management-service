/**
 * Defines unique symbols used as injection tokens for dependency injection (tsyringe)
 * within the User Management Service.
 */
export const TYPES = {
    // Application Layer Interfaces / Ports
    Logger: Symbol.for('Logger'),
    ConfigService: Symbol.for('ConfigService'),
    UserAdminService: Symbol.for('UserAdminService'), // Service for user admin logic
    GroupAdminService: Symbol.for('GroupAdminService'), // Service for group admin logic
    UserMgmtAdapter: Symbol.for('UserMgmtAdapter'), // Adapter for IdP admin actions

    // Infrastructure Layer Implementations (Usually not injected directly by type)
    // Example: WinstonLogger: Symbol.for('WinstonLogger'),

    // API Layer (Controllers)
    UserAdminController: Symbol.for('UserAdminController'),
    GroupAdminController: Symbol.for('GroupAdminController'),
    SystemController: Symbol.for('SystemController'),
    RoleAdminService: Symbol.for('RoleAdminService'), // Service for role admin logic
    PermissionAdminService: Symbol.for('PermissionAdminService'), // Service for permission admin logic
    // Add other tokens as needed
};
