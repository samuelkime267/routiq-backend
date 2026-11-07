import { z } from "zod";
import { USER_ROLES, USER_STATUSES } from "@/models/user.model";

export const listUsersQuerySchema = z.object({
  role: z.enum(USER_ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListUsersQuerySchemaType = z.infer<typeof listUsersQuerySchema>;
