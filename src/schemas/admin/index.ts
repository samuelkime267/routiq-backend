import { z } from "zod";
import {
  ADMIN_STATUSES,
  PERMISSIONS,
} from "@/config/permissions";
import {
  ADMIN_INVITATION_STATUSES,
} from "@/models/adminInvitation.model";
import { updatePasswordSchema } from "@/schemas/auth";

/**
 * Role keys are validated against the runtime role registry. The schema only
 * enforces the format so custom roles work without a deploy.
 */
export const adminRoleKeySchema = z
  .string("Role is required")
  .trim()
  .min(2, "Role is required")
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

export const adminLoginSchema = z.object({
  email: z.email("Invalid email address"),
  password: z.string("Password is required"),
});

export const adminInviteSchema = z.object({
  name: z.string("Name is required").min(3, "Name is required"),
  email: z.email("Invalid email address"),
  adminRole: adminRoleKeySchema,
  reason: reasonSchema,
});

export const adminRoleSchema = z.object({
  adminRole: adminRoleKeySchema,
  reason: reasonSchema,
});

export const adminStatusSchema = z.object({
  adminStatus: z.enum(ADMIN_STATUSES),
  reason: reasonSchema,
});

export const adminPermissionsSchema = z.object({
  grants: z.array(z.enum(PERMISSIONS)).default([]),
  revocations: z.array(z.enum(PERMISSIONS)).default([]),
  reason: reasonSchema,
});

export const acceptAdminInvitationSchema = z.object({
  token: z
    .string("Invitation token is required")
    .trim()
    .min(20, "This invitation link is invalid"),
  password: updatePasswordSchema.shape.password,
});

export const adminInvitationActionSchema = z.object({
  reason: reasonSchema,
});

export const updateAdminProfileSchema = z.object({
  name: z.string().trim().min(3, "Name is required").max(80).optional(),
  phone: z
    .string()
    .trim()
    .max(20, "Phone number is too long")
    .nullable()
    .optional(),
  profilePicture: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .optional(),
  reason: reasonSchema,
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
  role: adminRoleKeySchema.optional(),
  status: z.enum(ADMIN_STATUSES).optional(),
  invitationStatus: z.enum(ADMIN_INVITATION_STATUSES).optional(),
  search: z.string().trim().max(120).optional(),
  sortBy: z.enum(ADMIN_SORT_FIELDS).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const ADMIN_INVITATION_SORT_FIELDS = [
  "createdAt",
  "email",
  "name",
  "adminRole",
  "status",
  "expiresAt",
  "acceptedAt",
] as const;

export const listAdminInvitationsQuerySchema = z.object({
  status: z.enum(ADMIN_INVITATION_STATUSES).optional(),
  role: adminRoleKeySchema.optional(),
  search: z.string().trim().max(120).optional(),
  sortBy: z.enum(ADMIN_INVITATION_SORT_FIELDS).default("createdAt"),
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
export type AcceptAdminInvitationSchemaType = z.infer<
  typeof acceptAdminInvitationSchema
>;
export type AdminInvitationActionSchemaType = z.infer<
  typeof adminInvitationActionSchema
>;
export type UpdateAdminProfileSchemaType = z.infer<
  typeof updateAdminProfileSchema
>;
export type ListAdminsQuerySchemaType = z.infer<typeof listAdminsQuerySchema>;
export type ListAdminInvitationsQuerySchemaType = z.infer<
  typeof listAdminInvitationsQuerySchema
>;
