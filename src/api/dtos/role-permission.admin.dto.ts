import { z } from 'zod';

// --- Role DTOs ---

export const CreateRoleAdminSchema = z.object({
    body: z.object({
        roleName: z.string({ required_error: "Role name is required" }).min(1).max(128),
        description: z.string().max(2048).optional(),
    }),
});
export type CreateRoleAdminDto = z.infer<typeof CreateRoleAdminSchema>['body'];

export const RoleNameParamsSchema = z.object({
    params: z.object({
        roleName: z.string({ required_error: "Role name parameter is required" }),
    }),
});
export type RoleNameParamsDto = z.infer<typeof RoleNameParamsSchema>['params'];

export const UpdateRoleAdminSchema = z.object({
    params: RoleNameParamsSchema.shape.params, // Reuse params schema
    body: z.object({
        description: z.string().max(2048).optional(), // Only allow description update for now
    }).refine(data => Object.keys(data).length > 0, { message: "No update data provided" }),
});
export type UpdateRoleAdminDto = z.infer<typeof UpdateRoleAdminSchema>['body'];


// --- Permission DTOs ---

export const CreatePermissionAdminSchema = z.object({
    body: z.object({
        permissionName: z.string({ required_error: "Permission name is required" }).min(1).max(128),
        description: z.string().max(2048).optional(),
    }),
});
export type CreatePermissionAdminDto = z.infer<typeof CreatePermissionAdminSchema>['body'];

export const PermissionNameParamsSchema = z.object({
    params: z.object({
        permissionName: z.string({ required_error: "Permission name parameter is required" }),
    }),
});
export type PermissionNameParamsDto = z.infer<typeof PermissionNameParamsSchema>['params'];

export const UpdatePermissionAdminSchema = z.object({
     params: PermissionNameParamsSchema.shape.params,
     body: z.object({
        description: z.string().max(2048).optional(),
    }).refine(data => Object.keys(data).length > 0, { message: "No update data provided" }),
});
export type UpdatePermissionAdminDto = z.infer<typeof UpdatePermissionAdminSchema>['body'];


// --- Assignment DTOs ---

// Role <-> Permission Assignment
export const RolePermissionAssignSchema = z.object({
    params: RoleNameParamsSchema.shape.params, // Get roleName from params
    body: z.object({
        permissionName: z.string({ required_error: "Permission name is required" }).min(1),
    }),
});
export type RolePermissionAssignDto = z.infer<typeof RolePermissionAssignSchema>['body'];

export const RolePermissionUnassignSchema = z.object({
    params: z.object({
        roleName: z.string({ required_error: "Role name parameter is required" }),
        permissionName: z.string({ required_error: "Permission name parameter is required" }),
    }),
});
export type RolePermissionUnassignParams = z.infer<typeof RolePermissionUnassignSchema>['params'];


// Group <-> Role Assignment
export const GroupRoleAssignSchema = z.object({
    params: z.object({ // Assuming groupName from params
        groupName: z.string({ required_error: "Group name parameter is required" }),
    }),
    body: z.object({
        roleName: z.string({ required_error: "Role name is required" }).min(1),
    }),
});
export type GroupRoleAssignDto = z.infer<typeof GroupRoleAssignSchema>['body'];
export type GroupRoleAssignParams = z.infer<typeof GroupRoleAssignSchema>['params'];


export const GroupRoleUnassignSchema = z.object({
    params: z.object({
        groupName: z.string({ required_error: "Group name parameter is required" }),
        roleName: z.string({ required_error: "Role name parameter is required" }),
    }),
});
export type GroupRoleUnassignParams = z.infer<typeof GroupRoleUnassignSchema>['params'];


// User <-> Custom Role Assignment
export const UserCustomRoleAssignSchema = z.object({
    params: z.object({ // Assuming username from params
        username: z.string({ required_error: "Username parameter is required" }),
    }),
    body: z.object({
        roleName: z.string({ required_error: "Role name is required" }).min(1),
    }),
});
export type UserCustomRoleAssignDto = z.infer<typeof UserCustomRoleAssignSchema>['body'];
export type UserCustomRoleAssignParams = z.infer<typeof UserCustomRoleAssignSchema>['params'];


export const UserCustomRoleUnassignSchema = z.object({
    params: z.object({
        username: z.string({ required_error: "Username parameter is required" }),
        roleName: z.string({ required_error: "Role name parameter is required" }),
    }),
});
export type UserCustomRoleUnassignParams = z.infer<typeof UserCustomRoleUnassignSchema>['params'];


// User <-> Custom Permission Assignment
export const UserCustomPermissionAssignSchema = z.object({
    params: z.object({ // Assuming username from params
        username: z.string({ required_error: "Username parameter is required" }),
    }),
    body: z.object({
        permissionName: z.string({ required_error: "Permission name is required" }).min(1),
    }),
});
export type UserCustomPermissionAssignDto = z.infer<typeof UserCustomPermissionAssignSchema>['body'];
export type UserCustomPermissionAssignParams = z.infer<typeof UserCustomPermissionAssignSchema>['params'];


export const UserCustomPermissionUnassignSchema = z.object({
    params: z.object({
        username: z.string({ required_error: "Username parameter is required" }),
        permissionName: z.string({ required_error: "Permission name parameter is required" }),
    }),
});
export type UserCustomPermissionUnassignParams = z.infer<typeof UserCustomPermissionUnassignSchema>['params'];

