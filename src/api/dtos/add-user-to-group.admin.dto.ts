import { z } from 'zod';

/**
 * Zod schema for validating adding a user to a group.
 * Assumes username is a route parameter, groupName is in the body.
 */
export const AddUserToGroupAdminSchema = z.object({
    params: z.object({
        username: z.string({ required_error: "Username parameter is required" }),
    }),
    body: z.object({
        groupName: z.string({ required_error: "Group name is required" })
            .min(1, "Group name cannot be empty"),
    }),
});

/**
 * TypeScript type inferred from the AddUserToGroupAdminSchema's body.
 */
export type AddUserToGroupAdminDto = z.infer<typeof AddUserToGroupAdminSchema>['body'];
/**
 * TypeScript type inferred from the AddUserToGroupAdminSchema's params.
 */
export type AddUserToGroupAdminParams = z.infer<typeof AddUserToGroupAdminSchema>['params'];


/**
 * Zod schema for removing a user from a group.
 * Assumes username and groupName are route parameters.
 */
export const RemoveUserFromGroupAdminSchema = z.object({
    params: z.object({
        username: z.string({ required_error: "Username parameter is required" }),
        groupName: z.string({ required_error: "Group name parameter is required" }),
    }),
});
/**
 * TypeScript type inferred from the RemoveUserFromGroupAdminSchema's params.
 */
export type RemoveUserFromGroupAdminParams = z.infer<typeof RemoveUserFromGroupAdminSchema>['params'];


