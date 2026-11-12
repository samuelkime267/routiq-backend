import { z } from "zod";

const reasonSchema = z
  .string()
  .trim()
  .max(500, "Reason cannot exceed 500 characters")
  .optional();

const marketplaceSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    tagline: z.string().trim().max(160).optional(),
    supportEmail: z.email("Enter a valid support email").optional(),
    supportPhone: z.string().trim().max(30).nullable().optional(),
    timezone: z.literal("Africa/Lagos").optional(),
  })
  .strict();

const commissionSchema = z
  .object({
    /** Percentage, not a fraction. 7.5 means 7.5%. */
    ratePercent: z
      .number()
      .min(0, "Commission cannot be negative")
      .max(50, "Commission cannot exceed 50%")
      .optional(),
    note: z.string().trim().max(240).optional(),
  })
  .strict();

const storeApprovalSchema = z
  .object({
    requireManualReview: z.boolean().optional(),
    autoApproveVerifiedStores: z.boolean().optional(),
    reviewSlaHours: z.number().int().min(1).max(720).optional(),
  })
  .strict();

const shippingSchema = z
  .object({
    provider: z.literal("shipbubble").optional(),
    defaultDeliveryFee: z.number().min(0).optional(),
    freeShippingThreshold: z.number().min(0).nullable().optional(),
    estimatedDeliveryDays: z.number().int().min(1).max(30).optional(),
  })
  .strict();

const notificationsSchema = z
  .object({
    emailEnabled: z.boolean().optional(),
    adminDailyDigest: z.boolean().optional(),
    vendorAlerts: z.boolean().optional(),
    disputeAlerts: z.boolean().optional(),
    storeSubmissionAlerts: z.boolean().optional(),
  })
  .strict();

const securitySchema = z
  .object({
    invitationExpiryHours: z.number().int().min(1).max(720).optional(),
    passwordResetExpiryMinutes: z.number().int().min(5).max(1440).optional(),
    auditRetentionDays: z.number().int().min(30).max(3650).optional(),
    requireReasonForDestructiveActions: z.boolean().optional(),
  })
  .strict();

export const updateSettingsSchema = z
  .object({
    marketplace: marketplaceSchema.optional(),
    commission: commissionSchema.optional(),
    productCategories: z
      .array(z.string().trim().min(1).max(60))
      .min(1, "Keep at least one product category")
      .max(60, "Too many categories")
      .transform((categories) => [...new Set(categories)])
      .optional(),
    storeApproval: storeApprovalSchema.optional(),
    shipping: shippingSchema.optional(),
    notifications: notificationsSchema.optional(),
    security: securitySchema.optional(),
    reason: reasonSchema,
  })
  .refine(
    (value) =>
      value.marketplace !== undefined ||
      value.commission !== undefined ||
      value.productCategories !== undefined ||
      value.storeApproval !== undefined ||
      value.shipping !== undefined ||
      value.notifications !== undefined ||
      value.security !== undefined,
    "Choose at least one settings group to update",
  );

export type UpdateSettingsSchemaType = z.infer<typeof updateSettingsSchema>;
