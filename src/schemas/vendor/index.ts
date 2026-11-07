import { z } from "zod";
import { STORE_STATUSES } from "@/models/store.model";
import { USER_STATUSES } from "@/models/user.model";

export const VENDOR_SORT_FIELDS = [
  "name",
  "email",
  "status",
  "createdAt",
] as const;

export const listVendorsQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.enum(USER_STATUSES).optional(),
  storeStatus: z.enum(STORE_STATUSES).optional(),
  category: z.string().trim().max(80).optional(),
  sortBy: z.enum(VENDOR_SORT_FIELDS).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const paginationQuery = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

export const vendorProductsQuerySchema = z.object({
  status: z
    .enum(["draft", "pending", "approved", "rejected", "archived"])
    .optional(),
  search: z.string().trim().max(120).optional(),
  ...paginationQuery,
});

export const vendorOrdersQuerySchema = z.object({
  status: z
    .enum([
      "pending",
      "confirmed",
      "processing",
      "shipped",
      "delivered",
      "cancelled",
      "refunded",
    ])
    .optional(),
  ...paginationQuery,
});

export const vendorTransactionsQuerySchema = z.object({
  status: z.enum(["pending", "successful", "failed", "refunded"]).optional(),
  ...paginationQuery,
});

export const vendorHistoryQuerySchema = z.object({
  action: z
    .enum([
      "submitted",
      "resubmitted",
      "approved",
      "rejected",
      "information_requested",
      "suspended",
      "reactivated",
    ])
    .optional(),
  ...paginationQuery,
});

export const vendorStatusSchema = z
  .object({
    status: z.enum(["active", "suspended"]),
    reason: z.string().trim().max(1000).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.status === "suspended" && (!value.reason || value.reason.length < 5)) {
      ctx.addIssue({
        code: "custom",
        path: ["reason"],
        message: "A suspension reason of at least 5 characters is required",
      });
    }
  });

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-f\d]{24}$/i, "Enter a valid store id");

export const createVendorNoteSchema = z.object({
  body: z
    .string()
    .trim()
    .min(3, "A note needs at least 3 characters")
    .max(2000, "Notes cannot exceed 2000 characters"),
  storeId: objectIdSchema.optional(),
});

export type ListVendorsQuerySchemaType = z.infer<
  typeof listVendorsQuerySchema
>;
export type VendorStatusSchemaType = z.infer<typeof vendorStatusSchema>;
export type CreateVendorNoteSchemaType = z.infer<
  typeof createVendorNoteSchema
>;
export type VendorProductsQuerySchemaType = z.infer<
  typeof vendorProductsQuerySchema
>;
export type VendorOrdersQuerySchemaType = z.infer<
  typeof vendorOrdersQuerySchema
>;
export type VendorTransactionsQuerySchemaType = z.infer<
  typeof vendorTransactionsQuerySchema
>;
export type VendorHistoryQuerySchemaType = z.infer<
  typeof vendorHistoryQuerySchema
>;
