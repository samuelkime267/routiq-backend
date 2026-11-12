import { z } from "zod";
import { PERMISSIONS } from "@/config/permissions";

export const adminRoleKeyInputSchema = z
  .string("Role key is required")
  .trim()
  .min(2, "Role key is required")
  .max(60, "Role key is too long")
  .regex(
    /^[A-Za-z][A-Za-z0-9_]*$/,
    "Role keys may only use letters, numbers and underscores",
  )
  .transform((value) => value.toUpperCase());

const reasonSchema = z
  .string()
  .trim()
  .max(500, "Reason cannot exceed 500 characters")
  .optional();

export const ADMIN_ROLE_SORT_FIELDS = [
  "key",
  "label",
  "createdAt",
  "updatedAt",
] as const;

export const listAdminRolesQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  /** `true` / `false` filters built-in and custom roles. */
  system: z
    .enum(["true", "false"])
    .optional()
    .transform((value) =>
      value === undefined ? undefined : value === "true",
    ),
  sortBy: z.enum(ADMIN_ROLE_SORT_FIELDS).default("key"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const createAdminRoleSchema = z.object({
  key: adminRoleKeyInputSchema,
  label: z.string("Role name is required").trim().min(2).max(80),
  description: z.string().trim().max(300).optional().default(""),
  permissions: z
    .array(z.enum(PERMISSIONS))
    .min(1, "Select at least one permission")
    .max(PERMISSIONS.length),
  reason: reasonSchema,
});

export const updateAdminRoleSchema = z
  .object({
    label: z.string().trim().min(2).max(80).optional(),
    description: z.string().trim().max(300).optional(),
    permissions: z.array(z.enum(PERMISSIONS)).min(1).optional(),
    reason: reasonSchema,
  })
  .refine(
    (value) =>
      value.label !== undefined ||
      value.description !== undefined ||
      value.permissions !== undefined,
    "Choose at least one field to update",
  );

export type ListAdminRolesQuerySchemaType = z.infer<
  typeof listAdminRolesQuerySchema
>;
export type CreateAdminRoleSchemaType = z.infer<
  typeof createAdminRoleSchema
>;
export type UpdateAdminRoleSchemaType = z.infer<
  typeof updateAdminRoleSchema
>;
