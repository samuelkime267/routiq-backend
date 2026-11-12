import mongoose, { HydratedDocument, InferSchemaType } from "mongoose";
import { PLATFORM_COMMISSION_RATE } from "@/config/marketplace";

/**
 * Single platform-wide configuration document.
 *
 * These values control presentation and administrative workflows only. They do
 * not alter the payment, escrow or settlement ledgers: a payment stores the
 * commission and vendor amounts calculated when it was recorded, so changing a
 * value here can never rewrite money that has already moved.
 */
export const PRODUCT_CATEGORY_DEFAULTS = [
  "Groceries",
  "Fresh Produce",
  "Beverages",
  "Home & Kitchen",
  "Personal Care",
  "Baby & Kids",
  "Electronics",
  "Fashion",
  "Health & Wellness",
  "Pet Supplies",
] as const;

const platformSettingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: "platform",
      immutable: true,
    },
    marketplace: {
      name: { type: String, default: "Routiq", trim: true },
      tagline: {
        type: String,
        default: "Nigeria's marketplace for everyday essentials",
        trim: true,
      },
      supportEmail: {
        type: String,
        default: "support@routiq.ng",
        trim: true,
        lowercase: true,
      },
      supportPhone: { type: String, default: null, trim: true },
      currency: {
        type: String,
        enum: ["NGN"],
        default: "NGN",
        immutable: true,
      },
      timezone: {
        type: String,
        enum: ["Africa/Lagos"],
        default: "Africa/Lagos",
      },
    },
    commission: {
      /**
       * Percentage retained by the marketplace. This is the reference rate for
       * new business; recorded payments keep their own immutable fee.
       */
      ratePercent: {
        type: Number,
        min: 0,
        max: 50,
        default: Math.round(PLATFORM_COMMISSION_RATE * 1000) / 10,
      },
      note: {
        type: String,
        default:
          "Applied to new payments only. Commission already recorded on a payment never changes.",
        trim: true,
      },
    },
    productCategories: {
      type: [String],
      default: [...PRODUCT_CATEGORY_DEFAULTS],
    },
    storeApproval: {
      requireManualReview: { type: Boolean, default: true },
      autoApproveVerifiedStores: { type: Boolean, default: false },
      reviewSlaHours: { type: Number, min: 1, max: 720, default: 48 },
    },
    shipping: {
      provider: {
        type: String,
        enum: ["shipbubble"],
        default: "shipbubble",
      },
      defaultDeliveryFee: { type: Number, min: 0, default: 0 },
      freeShippingThreshold: { type: Number, min: 0, default: null },
      estimatedDeliveryDays: { type: Number, min: 1, max: 30, default: 3 },
    },
    notifications: {
      emailEnabled: { type: Boolean, default: true },
      adminDailyDigest: { type: Boolean, default: true },
      vendorAlerts: { type: Boolean, default: true },
      disputeAlerts: { type: Boolean, default: true },
      storeSubmissionAlerts: { type: Boolean, default: true },
    },
    security: {
      invitationExpiryHours: { type: Number, min: 1, max: 720, default: 168 },
      passwordResetExpiryMinutes: {
        type: Number,
        min: 5,
        max: 1440,
        default: 30,
      },
      auditRetentionDays: { type: Number, min: 30, max: 3650, default: 365 },
      requireReasonForDestructiveActions: { type: Boolean, default: true },
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

export type PlatformSettingType = InferSchemaType<
  typeof platformSettingSchema
>;

const PlatformSetting = mongoose.model(
  "PlatformSetting",
  platformSettingSchema,
);

export default PlatformSetting;
export type PlatformSettingDocument =
  HydratedDocument<PlatformSettingType>;
