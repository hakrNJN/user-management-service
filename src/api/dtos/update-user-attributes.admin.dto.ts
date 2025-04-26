import { z } from 'zod';

/**
 * Zod schema for validating admin update user attributes request payloads.
 */
export const UpdateUserAttributesAdminSchema = z.object({
    // Validate route parameter (e.g., /users/:username/attributes)
    params: z.object({
        username: z.string({ required_error: "Username parameter is required" })
            // You might want to add .min(1) here too if empty usernames aren't allowed
            .min(1, "Username parameter cannot be empty"),
    }),
    // Validate request body
    body: z.object({
        attributesToUpdate: z.record(
            z.string(), // Key type: string
            z.string({ required_error: "Attribute values must be strings" }) // Value type: string
        )
            .refine( // Use refine to check the number of keys
                (attributes) => Object.keys(attributes).length > 0,
                { message: "At least one attribute must be provided for update." } // Custom error message for the refinement
            ),
        // attributesToDelete: z.array(z.string()).optional(), // Optional: If deletion is supported
    }),
});

/**
 * TypeScript type inferred from the UpdateUserAttributesAdminSchema's body.
 */
export type UpdateUserAttributesAdminDto = z.infer<typeof UpdateUserAttributesAdminSchema>['body'];
/**
 * TypeScript type inferred from the UpdateUserAttributesAdminSchema's params.
 */
export type UpdateUserAttributesAdminParams = z.infer<typeof UpdateUserAttributesAdminSchema>['params'];

