import { z } from "zod";
import { ESCROW_STATUSES } from "@/models/escrow.model";

const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined)
  .refine(
    (value) => value === undefined || !Number.isNaN(new Date(value).getTime()),
    "Enter a valid date",
  );

export const ESCROW_SORT_FIELDS = [
  "heldAt",
  "releaseDueAt",
  "amountHeld",
  "status",
  "createdAt",
] as const;

export const listEscrowsQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.enum(ESCROW_STATUSES).optional(),
  /** ObjectId or customer name/email search term. */
  customer: z.string().trim().max(120).optional(),
  /** ObjectId or vendor/store name search term. */
  vendor: z.string().trim().max(120).optional(),
  /** Order id, order number, master order number or sub-order number. */
  order: z.string().trim().max(120).optional(),
  createdFrom: optionalDate,
  createdTo: optionalDate,
  sortBy: z.enum(ESCROW_SORT_FIELDS).default("heldAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListEscrowsQuery = z.infer<typeof listEscrowsQuerySchema>;
