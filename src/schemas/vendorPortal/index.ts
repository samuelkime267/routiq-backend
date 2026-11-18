import { z } from "zod";
import {
  BANK_ACCOUNT_REGEX,
  BANK_CODE_REGEX,
  NIGERIAN_PHONE_REGEX,
} from "@/config/nigeria";
import {
  PRODUCT_PUBLICATION_STATUSES,
  PRODUCT_STATUSES,
} from "@/models/product.model";
import {
  ORDER_PAYMENT_STATUSES,
  ORDER_STATUSES,
} from "@/models/order.model";
import { PAYMENT_CHANNELS, PAYMENT_STATUSES } from "@/models/payment.model";
import { SHIPMENT_STATUSES } from "@/models/shipment.model";
import { OPERATING_DAYS } from "@/models/store.model";
import { FULFILLMENT_STATUSES } from "@/services/orders/status";
import {
  OPEN_WITHDRAWAL_STATUSES,
  WITHDRAWAL_STATUSES,
} from "@/models/withdrawal.model";
import { TRANSACTION_TYPES } from "@/schemas/transaction";

const objectId = z
  .string()
  .trim()
  .regex(/^[a-f\d]{24}$/i, "Enter a valid id");

const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined)
  .refine(
    (value) => value === undefined || !Number.isNaN(new Date(value).getTime()),
    "Enter a valid date",
  );

const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

const sortOrder = z.enum(["asc", "desc"]).default("desc");

export const VENDOR_PRODUCT_SORT_FIELDS = [
  "createdAt",
  "updatedAt",
  "name",
  "price",
  "stock",
  "status",
  "publicationStatus",
] as const;

export const VENDOR_INVENTORY_FILTERS = [
  "in_stock",
  "low_stock",
  "out_of_stock",
] as const;

export const vendorProductListQuerySchema = z
  .object({
    search: z.string().trim().max(120).optional(),
    status: z.enum(PRODUCT_STATUSES).optional(),
    publicationStatus: z.enum(PRODUCT_PUBLICATION_STATUSES).optional(),
    category: z.string().trim().max(80).optional(),
    inventory: z.enum(VENDOR_INVENTORY_FILTERS).optional(),
    sortBy: z.enum(VENDOR_PRODUCT_SORT_FIELDS).default("createdAt"),
    sortOrder,
    ...pagination,
  })
  .strict();

const money = z.coerce
  .number()
  .int("Enter a whole Naira amount")
  .min(0, "Price cannot be negative")
  .max(100_000_000, "Price is too large");

const stock = z.coerce
  .number()
  .int("Stock must be a whole number")
  .min(0, "Stock cannot be negative")
  .max(1_000_000, "Stock is too large");

const images = z
  .array(z.string().trim().url("Enter a valid image URL"))
  .max(8, "Add at most 8 images")
  .default([]);

/**
 * Vendors submit catalogue content only. Moderation (`status`), placement
 * (`featured`) and review metadata are intentionally absent: the API owns them.
 */
export const createVendorProductSchema = z
  .object({
    name: z.string().trim().min(2, "Product name is required").max(140),
    category: z.string().trim().min(2, "Category is required").max(80),
    description: z.string().trim().max(2000).optional(),
    price: money,
    compareAtPrice: money.optional(),
    stock: stock.default(0),
    sku: z.string().trim().max(64).optional(),
    images,
  })
  .strict();

export const updateVendorProductSchema = createVendorProductSchema
  .partial()
  .strict();

export const updateVendorStockSchema = z
  .object({
    /** Absolute stock level. `delta` is an alternative for quick adjustments. */
    stock: stock.optional(),
    delta: z.coerce.number().int().min(-1_000_000).max(1_000_000).optional(),
  })
  .strict()
  .refine(
    (value) => value.stock !== undefined || value.delta !== undefined,
    "Provide a stock value or a delta",
  );

export const vendorProductPublicationSchema = z
  .object({ publish: z.boolean() })
  .strict();

export const VENDOR_ORDER_SORT_FIELDS = [
  "createdAt",
  "placedAt",
  "orderNumber",
  "total",
  "status",
  "paymentStatus",
] as const;

export const vendorOrderListQuerySchema = z
  .object({
    search: z.string().trim().max(120).optional(),
    status: z.enum(ORDER_STATUSES).optional(),
    paymentStatus: z.enum(ORDER_PAYMENT_STATUSES).optional(),
    fulfillmentStatus: z.enum(FULFILLMENT_STATUSES).optional(),
    shipmentStatus: z.enum(SHIPMENT_STATUSES).optional(),
    createdFrom: optionalDate,
    createdTo: optionalDate,
    sortBy: z.enum(VENDOR_ORDER_SORT_FIELDS).default("createdAt"),
    sortOrder,
    ...pagination,
  })
  .strict();

export const vendorOrderTimelineQuerySchema = z
  .object({
    ...pagination,
  })
  .strict();

export const VENDOR_ORDER_TRANSITIONS = [
  "confirmed",
  "processing",
  "delivered",
  "cancelled",
] as const;

export const vendorOrderStatusSchema = z
  .object({
    status: z.enum(VENDOR_ORDER_TRANSITIONS),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

export const vendorShipOrderSchema = z
  .object({
    courierName: z.string().trim().min(2, "Courier name is required").max(120),
    trackingNumber: z
      .string()
      .trim()
      .min(2, "Tracking number is required")
      .max(120),
    trackingUrl: z.string().trim().url("Enter a valid tracking URL").optional(),
    estimatedDeliveryAt: optionalDate,
    note: z.string().trim().max(500).optional(),
  })
  .strict();

export const VENDOR_TRANSACTION_SORT_FIELDS = [
  "createdAt",
  "paidAt",
  "amount",
  "reference",
  "status",
] as const;

export const vendorTransactionListQuerySchema = z
  .object({
    search: z.string().trim().max(120).optional(),
    type: z.enum(TRANSACTION_TYPES).optional(),
    status: z.enum(PAYMENT_STATUSES).optional(),
    channel: z.enum(PAYMENT_CHANNELS).optional(),
    order: z.string().trim().max(120).optional(),
    createdFrom: optionalDate,
    createdTo: optionalDate,
    sortBy: z.enum(VENDOR_TRANSACTION_SORT_FIELDS).default("createdAt"),
    sortOrder,
    ...pagination,
  })
  .strict();

export const vendorFinanceQuerySchema = z
  .object({
    range: z.enum(["today", "7d", "30d", "90d", "custom"]).default("30d"),
    from: z.string().trim().optional(),
    to: z.string().trim().optional(),
  })
  .strict();

export const VENDOR_WITHDRAWAL_SORT_FIELDS = [
  "createdAt",
  "requestedAt",
  "amount",
  "status",
  "paidAt",
] as const;

export const vendorWithdrawalListQuerySchema = z
  .object({
    search: z.string().trim().max(120).optional(),
    status: z.enum(WITHDRAWAL_STATUSES).optional(),
    createdFrom: optionalDate,
    createdTo: optionalDate,
    sortBy: z.enum(VENDOR_WITHDRAWAL_SORT_FIELDS).default("createdAt"),
    sortOrder,
    ...pagination,
  })
  .strict();

export const MIN_WITHDRAWAL_AMOUNT = 1_000;

export const createWithdrawalSchema = z
  .object({
    amount: z.coerce
      .number()
      .int("Enter a whole Naira amount")
      .min(
        MIN_WITHDRAWAL_AMOUNT,
        `The minimum withdrawal is ₦${MIN_WITHDRAWAL_AMOUNT.toLocaleString("en-NG")}`,
      ),
    bankAccountId: objectId,
    /** Optional client key; the API derives one when omitted. */
    idempotencyKey: z.string().trim().min(8).max(120).optional(),
    note: z.string().trim().max(300).optional(),
  })
  .strict();

export const cancelWithdrawalSchema = z
  .object({ reason: z.string().trim().max(300).optional() })
  .strict();

const bankAccountFields = {
  bankName: z.string().trim().min(2, "Bank name is required").max(120),
  bankCode: z
    .string()
    .trim()
    .regex(BANK_CODE_REGEX, "Enter a valid Nigerian bank code"),
  accountName: z.string().trim().min(2, "Account name is required").max(160),
  accountNumber: z
    .string()
    .trim()
    .regex(BANK_ACCOUNT_REGEX, "Enter a valid 10-digit account number"),
};

export const createBankAccountSchema = z.object(bankAccountFields).strict();

export const updateBankAccountSchema = z
  .object({
    ...bankAccountFields,
    isDefault: z.boolean().optional(),
  })
  .partial()
  .strict();

export const bankAccountIdSchema = z.object({ id: objectId }).strict();

export const verifyBankAccountSchema = z
  .object({
    status: z.enum(["verified", "rejected"]),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

const operatingHour = z
  .object({
    day: z.enum(OPERATING_DAYS),
    isOpen: z.boolean(),
    openingTime: z
      .string()
      .trim()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM")
      .nullable()
      .optional(),
    closingTime: z
      .string()
      .trim()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM")
      .nullable()
      .optional(),
  })
  .strict();

/**
 * Settings split deliberately:
 *
 * - `profile` edits the vendor account.
 * - `storefront` edits presentation fields that do not change KYB identity.
 * - `operations` edits pickup instructions and opening hours.
 *
 * Legal identity, documents, representative and settlement account are not
 * editable here; they stay behind the existing store review workflow.
 */
export const updateVendorSettingsSchema = z
  .object({
    profile: z
      .object({
        name: z.string().trim().min(2, "Your name is required").max(120),
        phone: z
          .string()
          .trim()
          .regex(NIGERIAN_PHONE_REGEX, "Enter a valid Nigerian phone number")
          .nullable()
          .optional(),
        profilePicture: z.string().trim().url().nullable().optional(),
      })
      .partial()
      .strict()
      .optional(),
    storefront: z
      .object({
        description: z.string().trim().max(1000).nullable().optional(),
        phoneNumber: z
          .string()
          .trim()
          .regex(NIGERIAN_PHONE_REGEX, "Enter a valid Nigerian phone number")
          .optional(),
        logo: z.string().trim().url().nullable().optional(),
        coverImage: z.string().trim().url().nullable().optional(),
      })
      .partial()
      .strict()
      .optional(),
    operations: z
      .object({
        pickupInstructions: z.string().trim().max(1000).nullable().optional(),
        operatingHours: z.array(operatingHour).max(7).optional(),
      })
      .partial()
      .strict()
      .optional(),
  })
  .strict()
  .refine(
    (value) => value.profile || value.storefront || value.operations,
    "Nothing to update",
  );

export const ADMIN_WITHDRAWAL_SORT_FIELDS = [
  "createdAt",
  "requestedAt",
  "amount",
  "status",
  "paidAt",
] as const;

export const adminWithdrawalListQuerySchema = z
  .object({
    search: z.string().trim().max(120).optional(),
    status: z.enum(WITHDRAWAL_STATUSES).optional(),
    /** `open` groups pending, approved and processing requests. */
    scope: z.enum(["open", "settled", "all"]).default("all"),
    vendor: z.string().trim().max(120).optional(),
    createdFrom: optionalDate,
    createdTo: optionalDate,
    sortBy: z.enum(ADMIN_WITHDRAWAL_SORT_FIELDS).default("createdAt"),
    sortOrder,
    ...pagination,
  })
  .strict();

export const adminWithdrawalDecisionSchema = z
  .object({
    action: z.enum(["approve", "reject", "processing", "paid"]),
    reason: z.string().trim().max(500).optional(),
    payoutReference: z.string().trim().max(120).optional(),
    adminNote: z.string().trim().max(1000).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.action === "paid" && !value.payoutReference) {
      context.addIssue({
        code: "custom",
        path: ["payoutReference"],
        message:
          "A payout reference is required before a withdrawal can be marked paid",
      });
    }

    if (value.action === "reject" && !value.reason) {
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "A rejection reason is required",
      });
    }
  });

export const adminWithdrawalQuerySchema = z
  .object({ id: objectId })
  .strict();

export const OPEN_WITHDRAWAL_STATUS_LIST = OPEN_WITHDRAWAL_STATUSES;

export type VendorProductListQuery = z.infer<
  typeof vendorProductListQuerySchema
>;
export type CreateVendorProductInput = z.infer<
  typeof createVendorProductSchema
>;
export type UpdateVendorProductInput = z.infer<
  typeof updateVendorProductSchema
>;
export type VendorOrderListQuery = z.infer<typeof vendorOrderListQuerySchema>;
export type VendorTransactionListQuery = z.infer<
  typeof vendorTransactionListQuerySchema
>;
export type VendorWithdrawalListQuery = z.infer<
  typeof vendorWithdrawalListQuerySchema
>;
export type AdminWithdrawalListQuery = z.infer<
  typeof adminWithdrawalListQuerySchema
>;
export type CreateWithdrawalInput = z.infer<typeof createWithdrawalSchema>;
export type CreateBankAccountInput = z.infer<
  typeof createBankAccountSchema
>;
export type UpdateBankAccountInput = z.infer<
  typeof updateBankAccountSchema
>;
export type UpdateVendorSettingsInput = z.infer<
  typeof updateVendorSettingsSchema
>;
