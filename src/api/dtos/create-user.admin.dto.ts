import { z } from 'zod';

/**
 * Zod schema for validating admin create user request payloads.
 */
export const CreateUserAdminSchema = z.object({
    body: z.object({
        // TODO: Add deeper semantic validation here.
        // For example, validate username uniqueness (requires service call).
        // Validate email format more strictly if needed.
        // Check for strong password policies if temporaryPassword is provided.
        // Validate custom attributes against business rules.

        username: z.string({ required_error: 'Username is required' })
            .min(3).max(128), // Adjust constraints as needed

        temporaryPassword: z.string().min(8).max(128).optional(), // Optional, Cognito can generate

        userAttributes: z.record(z.string(), z.string({ required_error: "Attribute values must be strings" }))
            .refine(attrs => attrs.email, { message: "Email attribute is required" }), // Ensure email is present

        // Add other fields corresponding to AdminCreateUserDetails if needed
        // suppressWelcomeMessage: z.boolean().optional(),
        // forceAliasCreation: z.boolean().optional(),
    }),
});

/**
 * TypeScript type inferred from the CreateUserAdminSchema's body definition.
 */
export type CreateUserAdminDto = z.infer<typeof CreateUserAdminSchema>['body'];

