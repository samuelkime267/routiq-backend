import { z } from "zod";
import { USER_ROLES } from "@/models/user.model";

export const changeUserRoleSchema = z.object({
  role: z.enum(USER_ROLES),
});

export type ChangeUserRoleSchemaType = z.infer<typeof changeUserRoleSchema>;
