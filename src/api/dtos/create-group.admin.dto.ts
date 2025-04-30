import { z } from 'zod';

// Define the allowed pattern for group names (e.g., alphanumeric, dashes, underscores)
// Adjust this regex based on Cognito's actual limitations or your desired rules
const groupNameRegex = /^[a-zA-Z0-9_-]+$/;
const GROUP_NAME_REGEX_ERROR_MSG = 'Group name must contain only alphanumeric characters, underscores, or hyphens.';
const GROUP_NAME_LENGTH_ERROR_MSG = "Group name must be between 1 and 128 characters.";


/**
 * Zod schema for validating create group request payloads.
 */
export const CreateGroupAdminSchema = z.object({
    body: z.object({
        groupName: z.string({ required_error: "Group name is required" })
            .min(1).max(128, { message: GROUP_NAME_LENGTH_ERROR_MSG }) // Add explicit length message
            .regex(groupNameRegex, { message: GROUP_NAME_REGEX_ERROR_MSG }), // Apply regex
        description: z.string().max(2048).optional(),
        precedence: z.number().int().min(0).optional(),
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
        // --- >>> APPLY VALIDATION RULES HERE <<< ---
        groupName: z.string({ required_error: "Group name parameter is required" })
            .min(1).max(128, { message: GROUP_NAME_LENGTH_ERROR_MSG }) // Add length checks
            .regex(groupNameRegex, { message: GROUP_NAME_REGEX_ERROR_MSG }), // Add regex check
    }),
});
/**
 * TypeScript type inferred from the GroupNameParamsSchema's params definition.
 */
export type GroupNameParamsDto = z.infer<typeof GroupNameParamsSchema>['params'];