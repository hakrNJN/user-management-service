import { z } from 'zod';

/**
 * Zod schema for validating create group request payloads.
 */
export const CreateGroupAdminSchema = z.object({
    body: z.object({
        groupName: z.string({ required_error: "Group name is required" })
            .min(1).max(128), // Adjust constraints
        description: z.string().max(2048).optional(),
        precedence: z.number().int().min(0).optional(),
        // roleArn: z.string().optional(), // If using IAM roles
    }),
});

/**
 * TypeScript type inferred from the CreateGroupAdminSchema's body definition.
 */
export type CreateGroupAdminDto = z.infer<typeof CreateGroupAdminSchema>['body'];


/**
 * Zod schema for validating group name in route parameters (e.g., for delete/get).
 */
export const GroupNameParamsSchema = z.object({
    params: z.object({
        groupName: z.string({ required_error: "Group name parameter is required" }),
    }),
});
/**
 * TypeScript type inferred from the GroupNameParamsSchema's params definition.
 */
export type GroupNameParamsDto = z.infer<typeof GroupNameParamsSchema>['params'];

