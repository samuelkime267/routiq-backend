import { z } from "zod";
import {
  PAYMENT_CHANNELS,
  PAYMENT_STATUSES,
} from "@/models/payment.model";

const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined)
  .refine(
    (value) => value === undefined || !Number.isNaN(new Date(value).getTime()),
    "Enter a valid date",
  );

/**
 * A payment record is also the transaction ledger. Refunds are derived from
 * the payment status rather than stored as a second transaction document.
 */
export const TRANSACTION_TYPES = ["payment", "refund"] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_SORT_FIELDS = [
  "createdAt",
  "paidAt",
  "amount",
  "reference",
  "status",
] as const;

export const listTransactionsQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  type: z.enum(TRANSACTION_TYPES).optional(),
  status: z.enum(PAYMENT_STATUSES).optional(),
  channel: z.enum(PAYMENT_CHANNELS).optional(),
  /** ObjectId or customer name/email search term. */
  customer: z.string().trim().max(120).optional(),
  /** ObjectId or vendor/store name search term. */
  vendor: z.string().trim().max(120).optional(),
  /** Order id, order number, master order number or sub-order number. */
  order: z.string().trim().max(120).optional(),
  createdFrom: optionalDate,
  createdTo: optionalDate,
  sortBy: z.enum(TRANSACTION_SORT_FIELDS).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListTransactionsQuery = z.infer<
  typeof listTransactionsQuerySchema
>;
