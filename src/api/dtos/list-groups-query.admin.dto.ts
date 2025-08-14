import { z } from 'zod';

export const ListGroupsQueryAdminSchema = z.object({
  query: z.object({
    limit: z.string().optional().transform((val) => val ? parseInt(val, 10) : undefined).refine((val) => val === undefined || !isNaN(val), { message: 'Limit must be a number' }),
    nextToken: z.string().optional(),
    filter: z.string().optional(),
    includeInactive: z.string().optional().transform((val) => val === 'true'),
  }),
});

export type ListGroupsQueryAdminDto = z.infer<typeof ListGroupsQueryAdminSchema>['query'];
