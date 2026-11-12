import { z } from "zod";
import { AUDIT_ENTITY_TYPES } from "@/models/auditLog.model";

const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined)
  .refine(
    (value) => value === undefined || !Number.isNaN(new Date(value).getTime()),
    "Enter a valid date",
  );

export const AUDIT_SORT_FIELDS = [
  "createdAt",
  "action",
  "entityType",
  "actorName",
] as const;

export const listAuditLogsQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  /** Admin id, name or email. */
  admin: z.string().trim().max(120).optional(),
  action: z.string().trim().max(120).optional(),
  entityType: z.enum(AUDIT_ENTITY_TYPES).optional(),
  entityId: z.string().trim().max(120).optional(),
  createdFrom: optionalDate,
  createdTo: optionalDate,
  sortBy: z.enum(AUDIT_SORT_FIELDS).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListAuditLogsQuerySchemaType = z.infer<
  typeof listAuditLogsQuerySchema
>;
