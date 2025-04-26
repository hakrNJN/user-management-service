import { z } from 'zod';

/**
 * Zod schema for validating query parameters for listing users.
 */
export const ListUsersQueryAdminSchema = z.object({
    query: z.object({
        limit: z.string().optional()
            .transform((val) => val ? parseInt(val, 10) : undefined) // Convert string to number
            .refine((val) => val === undefined || (val > 0 && val <= 100), { // Example validation
                message: "Limit must be between 1 and 100",
            }),
        paginationToken: z.string().optional(), // Token for next page
        filter: z.string().optional(), // Cognito filter string
        // Add other query params like 'status', 'group', etc. if needed
    }),
});

/**
 * TypeScript type inferred from the ListUsersQueryAdminSchema's query definition.
 */
export type ListUsersQueryAdminDto = z.infer<typeof ListUsersQueryAdminSchema>['query'];

