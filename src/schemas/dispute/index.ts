import { z } from "zod";
import {
  DISPUTE_CATEGORIES,
  DISPUTE_PRIORITIES,
  DISPUTE_STATUSES,
} from "@/models/dispute.model";

const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined)
  .refine(
    (value) => value === undefined || !Number.isNaN(new Date(value).getTime()),
    "Enter a valid date",
  );

const objectId = (label: string) =>
  z
    .string()
    .trim()
    .regex(/^[a-f\d]{24}$/i, `Enter a valid ${label}`);

export const DISPUTE_SORT_FIELDS = [
  "createdAt",
  "updatedAt",
  "priority",
  "status",
  "reference",
] as const;

export const listDisputesQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.enum(DISPUTE_STATUSES).optional(),
  category: z.enum(DISPUTE_CATEGORIES).optional(),
  priority: z.enum(DISPUTE_PRIORITIES).optional(),
  /** Admin ObjectId, `me`, or `unassigned`. */
  assignedTo: z.string().trim().max(40).optional(),
  /** ObjectId or customer name/email search term. */
  customer: z.string().trim().max(120).optional(),
  /** ObjectId or vendor/store name search term. */
  vendor: z.string().trim().max(120).optional(),
  order: z.string().trim().max(120).optional(),
  createdFrom: optionalDate,
  createdTo: optionalDate,
  sortBy: z.enum(DISPUTE_SORT_FIELDS).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const assignDisputeSchema = z.object({
  /** Omit to assign the dispute to yourself. */
  adminId: objectId("administrator id").optional(),
  note: z.string().trim().max(1000).optional(),
});

export const updateDisputeStatusSchema = z
  .object({
    status: z.enum(DISPUTE_STATUSES),
    note: z.string().trim().max(2000).optional(),
    /** Required when moving to AWAITING_INFORMATION. */
    message: z.string().trim().max(2000).optional(),
    /** Required when moving directly to RESOLVED. */
    resolution: z.string().trim().max(2000).optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.status === "AWAITING_INFORMATION" &&
      (!value.message || value.message.length < 10)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["message"],
        message: "Describe the information the customer needs to provide",
      });
    }

    if (
      value.status === "RESOLVED" &&
      (!value.resolution || value.resolution.length < 10)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["resolution"],
        message: "A resolution of at least 10 characters is required",
      });
    }
  });

export const createDisputeNoteSchema = z.object({
  body: z
    .string()
    .trim()
    .min(3, "A note needs at least 3 characters")
    .max(2000, "Notes cannot exceed 2000 characters"),
});

export const resolveDisputeSchema = z.object({
  resolution: z
    .string()
    .trim()
    .min(10, "A resolution of at least 10 characters is required")
    .max(2000, "The resolution cannot exceed 2000 characters"),
  note: z.string().trim().max(2000).optional(),
});

export type ListDisputesQuery = z.infer<typeof listDisputesQuerySchema>;
export type AssignDisputeInput = z.infer<typeof assignDisputeSchema>;
export type UpdateDisputeStatusInput = z.infer<
  typeof updateDisputeStatusSchema
>;
export type CreateDisputeNoteInput = z.infer<
  typeof createDisputeNoteSchema
>;
export type ResolveDisputeInput = z.infer<typeof resolveDisputeSchema>;
