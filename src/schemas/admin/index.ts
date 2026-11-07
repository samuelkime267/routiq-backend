import { z } from "zod";
import {
  ADMIN_ROLES,
  ADMIN_STATUSES,
  PERMISSIONS,
} from "@/config/permissions";

export const adminLoginSchema = z.object({
  email: z.email("Invalid email address"),
  password: z.string("Password is required"),
});

export const adminInviteSchema = z.object({
  name: z.string("Name is required").min(3, "Name is required"),
  email: z.email("Invalid email address"),
  adminRole: z.enum(ADMIN_ROLES),
});

export const adminRoleSchema = z.object({
  adminRole: z.enum(ADMIN_ROLES),
});

export const adminStatusSchema = z.object({
  adminStatus: z.enum(ADMIN_STATUSES),
});

export const adminPermissionsSchema = z.object({
  grants: z.array(z.enum(PERMISSIONS)).default([]),
  revocations: z.array(z.enum(PERMISSIONS)).default([]),
});

export const ADMIN_SORT_FIELDS = [
  "name",
  "email",
  "adminRole",
  "adminStatus",
  "createdAt",
  "lastLoginAt",
] as const;

export type AdminSortField = (typeof ADMIN_SORT_FIELDS)[number];

export const listAdminsQuerySchema = z.object({
  role: z.enum(ADMIN_ROLES).optional(),
  status: z.enum(ADMIN_STATUSES).optional(),
  search: z.string().trim().max(120).optional(),
  sortBy: z.enum(ADMIN_SORT_FIELDS).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type AdminLoginSchemaType = z.infer<typeof adminLoginSchema>;
export type AdminInviteSchemaType = z.infer<typeof adminInviteSchema>;
export type AdminRoleSchemaType = z.infer<typeof adminRoleSchema>;
export type AdminStatusSchemaType = z.infer<typeof adminStatusSchema>;
export type AdminPermissionsSchemaType = z.infer<
  typeof adminPermissionsSchema
>;
export type ListAdminsQuerySchemaType = z.infer<typeof listAdminsQuerySchema>;
