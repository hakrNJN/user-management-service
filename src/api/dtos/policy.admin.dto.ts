import { z } from 'zod';

// --- Base Policy Schema Components ---
const policyNameSchema = z.string({ required_error: "Policy name is required" })
    .min(3, "Policy name must be at least 3 characters")
    .max(256, "Policy name cannot exceed 256 characters")
    // Example regex: allow alphanumeric, dots, underscores, hyphens
    .regex(/^[a-zA-Z0-9._-]+$/, "Policy name can only contain alphanumeric characters, dots, underscores, or hyphens.");

const policyLanguageSchema = z.string({ required_error: "Policy language is required" })
    .min(1)
    .max(50)
    // Example: Restrict to known languages if needed
    .refine(lang => ['rego', 'cedar'].includes(lang.toLowerCase()), {
         message: "Supported policy languages are 'rego', 'cedar'.", // Adjust as needed
    });

const policyDefinitionSchema = z.string({ required_error: "Policy definition (code) is required" })
    .min(1, "Policy definition cannot be empty.");

const policyIdSchema = z.string().uuid({ message: "Policy ID must be a valid UUID" }); // Assuming UUIDs for IDs
const policyVersionSchema = z.number().int().positive({ message: "Policy version must be a positive integer" });

// --- Create Policy DTO ---
export const CreatePolicyAdminSchema = z.object({
    body: z.object({
        policyName: policyNameSchema,
        policyDefinition: policyDefinitionSchema,
        policyLanguage: policyLanguageSchema,
        description: z.string().max(2048).optional(),
        metadata: z.record(z.any()).optional(), // Allow any JSON structure for metadata
    }),
});
export type CreatePolicyAdminDto = z.infer<typeof CreatePolicyAdminSchema>['body'];

// --- Update Policy DTO ---
export const UpdatePolicyAdminSchema = z.object({
    params: z.object({
        // Allow update by ID or Name? Let's assume ID for simplicity here. Adjust if needed.
        policyId: policyIdSchema,
    }),
    body: z.object({
        policyName: policyNameSchema.optional(),
        policyDefinition: policyDefinitionSchema.optional(),
        policyLanguage: policyLanguageSchema.optional(),
        description: z.string().max(2048).optional(), // REMOVED .nullable()
        metadata: z.record(z.any()).optional(),      // REMOVED .nullable()
    }).refine(data => Object.keys(data).length > 0, {
        message: "At least one field must be provided for update.",
    }),
});
export type UpdatePolicyAdminDto = z.infer<typeof UpdatePolicyAdminSchema>['body'];
export type UpdatePolicyAdminParams = z.infer<typeof UpdatePolicyAdminSchema>['params'];


// --- Policy Identifier Param DTO ---
export const PolicyIdParamsSchema = z.object({
    params: z.object({
        policyId: policyIdSchema,
    }),
});
export type PolicyIdParamsDto = z.infer<typeof PolicyIdParamsSchema>['params'];

// --- Policy Version Params DTO ---
export const PolicyVersionParamsSchema = z.object({
    params: z.object({
        policyId: policyIdSchema,
        version: z.string().transform(Number).pipe(policyVersionSchema), // Transform string from URL to number
    }),
});
export type PolicyVersionParamsDto = z.infer<typeof PolicyVersionParamsSchema>['params'];

// --- Rollback Policy DTO ---
export const RollbackPolicySchema = z.object({
    params: z.object({
        policyId: policyIdSchema,
        version: z.string().transform(Number).pipe(policyVersionSchema), // Transform string from URL to number
    }),
});
export type RollbackPolicyDto = z.infer<typeof RollbackPolicySchema>['params'];

// Alternative: Allow identifying by name as well
// export const PolicyIdentifierParamsSchema = z.object({
//     params: z.object({
//         identifier: z.string().min(1), // Could be ID (UUID) or name
//     }),
// });
// export type PolicyIdentifierParamsDto = z.infer<typeof PolicyIdentifierParamsSchema>['params'];


// --- List Policies Query DTO ---
export const ListPoliciesQueryAdminSchema = z.object({
    query: z.object({
        limit: z.string().optional()
            .transform((val) => val ? parseInt(val, 10) : undefined)
            .refine((val) => val === undefined || (val > 0 && val <= 100), {
                message: "Limit must be between 1 and 100",
            }),
        // Assuming startKey is an opaque base64 encoded string or similar from DynamoDB/Repo
        startKey: z.string().optional(),
        // Allow filtering by language
        language: z.string().optional(),
         // Add other potential filters: nameContains, tag, etc.
    }),
});
export type ListPoliciesQueryAdminDto = z.infer<typeof ListPoliciesQueryAdminSchema>['query'];