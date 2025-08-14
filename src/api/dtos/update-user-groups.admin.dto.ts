import { z } from 'zod';

// DTO for updating a user's group memberships
export const UpdateUserGroupsAdminSchema = z.object({
  groupNames: z.array(z.string().min(1, 'Group name cannot be empty')).min(0, 'Group names array cannot be null'),
});

export type UpdateUserGroupsAdminDto = z.infer<typeof UpdateUserGroupsAdminSchema>;

// DTO for parameters (username) in the URL
export const UpdateUserGroupsAdminParams = z.object({
  username: z.string().min(1, 'Username is required'),
});

export type UpdateUserGroupsAdminParams = z.infer<typeof UpdateUserGroupsAdminParams>;
