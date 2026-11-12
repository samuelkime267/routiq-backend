import mongoose from "mongoose";
import PlatformSetting, {
  PRODUCT_CATEGORY_DEFAULTS,
} from "@/models/platformSetting.model";
import type { UpdateSettingsSchemaType } from "@/schemas/settings";

export const SETTINGS_KEY = "platform";

type UnknownRecord = Record<string, unknown>;

export interface PlatformSettingsView {
  marketplace: {
    name: string;
    tagline: string;
    supportEmail: string;
    supportPhone: string | null;
    currency: "NGN";
    timezone: "Africa/Lagos";
  };
  commission: {
    ratePercent: number;
    note: string;
    /** Recorded payments keep their own commission snapshot. */
    appliesToRecordedPayments: false;
  };
  productCategories: string[];
  storeApproval: {
    requireManualReview: boolean;
    autoApproveVerifiedStores: boolean;
    reviewSlaHours: number;
  };
  shipping: {
    provider: "shipbubble";
    defaultDeliveryFee: number;
    freeShippingThreshold: number | null;
    estimatedDeliveryDays: number;
  };
  notifications: {
    emailEnabled: boolean;
    adminDailyDigest: boolean;
    vendorAlerts: boolean;
    disputeAlerts: boolean;
    storeSubmissionAlerts: boolean;
  };
  security: {
    invitationExpiryHours: number;
    passwordResetExpiryMinutes: number;
    auditRetentionDays: number;
    requireReasonForDestructiveActions: boolean;
  };
  updatedBy: string | null;
  updatedAt: string | null;
}

export const DEFAULT_SETTINGS: Omit<
  PlatformSettingsView,
  "updatedBy" | "updatedAt"
> = {
  marketplace: {
    name: "Routiq",
    tagline: "Nigeria's marketplace for everyday essentials",
    supportEmail: "support@routiq.ng",
    supportPhone: null,
    currency: "NGN",
    timezone: "Africa/Lagos",
  },
  commission: {
    ratePercent: 7.5,
    note: "Applied to new payments only. Commission already recorded on a payment never changes.",
    appliesToRecordedPayments: false,
  },
  productCategories: [...PRODUCT_CATEGORY_DEFAULTS],
  storeApproval: {
    requireManualReview: true,
    autoApproveVerifiedStores: false,
    reviewSlaHours: 48,
  },
  shipping: {
    provider: "shipbubble",
    defaultDeliveryFee: 0,
    freeShippingThreshold: null,
    estimatedDeliveryDays: 3,
  },
  notifications: {
    emailEnabled: true,
    adminDailyDigest: true,
    vendorAlerts: true,
    disputeAlerts: true,
    storeSubmissionAlerts: true,
  },
  security: {
    invitationExpiryHours: 168,
    passwordResetExpiryMinutes: 30,
    auditRetentionDays: 365,
    requireReasonForDestructiveActions: true,
  },
};

function group<T extends UnknownRecord>(
  stored: unknown,
  fallback: T,
): T {
  return {
    ...fallback,
    ...((stored as UnknownRecord | null | undefined) ?? {}),
  } as T;
}

/** Converts a stored (possibly partial) document into the public shape. */
export function normaliseSettings(
  stored: UnknownRecord | null | undefined,
): PlatformSettingsView {
  const updatedBy = stored?.updatedBy ? String(stored.updatedBy) : null;
  const updatedAt = stored?.updatedAt
    ? new Date(String(stored.updatedAt)).toISOString()
    : null;

  return {
    marketplace: group(stored?.marketplace, DEFAULT_SETTINGS.marketplace),
    commission: {
      ...group(stored?.commission, DEFAULT_SETTINGS.commission),
      appliesToRecordedPayments: false,
    },
    productCategories:
      Array.isArray(stored?.productCategories) &&
      stored.productCategories.length > 0
        ? (stored.productCategories as string[])
        : [...DEFAULT_SETTINGS.productCategories],
    storeApproval: group(
      stored?.storeApproval,
      DEFAULT_SETTINGS.storeApproval,
    ),
    shipping: group(stored?.shipping, DEFAULT_SETTINGS.shipping),
    notifications: group(
      stored?.notifications,
      DEFAULT_SETTINGS.notifications,
    ),
    security: group(stored?.security, DEFAULT_SETTINGS.security),
    updatedBy,
    updatedAt,
  };
}

export async function getPlatformSettings(): Promise<PlatformSettingsView> {
  if (mongoose.connection.readyState !== 1) return normaliseSettings(null);

  const stored = await PlatformSetting.findOne({
    key: SETTINGS_KEY,
  }).lean<UnknownRecord>();

  return normaliseSettings(stored ?? null);
}

export async function updatePlatformSettings(
  input: UpdateSettingsSchemaType,
  adminId: unknown,
): Promise<PlatformSettingsView> {
  const set: Record<string, unknown> = { updatedBy: adminId ?? null };

  for (const key of [
    "marketplace",
    "commission",
    "storeApproval",
    "shipping",
    "notifications",
    "security",
  ] as const) {
    const value = input[key];

    if (!value) continue;

    for (const [field, fieldValue] of Object.entries(value)) {
      if (fieldValue !== undefined) {
        set[`${key}.${field}`] = fieldValue;
      }
    }
  }

  if (input.productCategories !== undefined) {
    set.productCategories = input.productCategories;
  }

  const stored = await PlatformSetting.findOneAndUpdate(
    { key: SETTINGS_KEY },
    {
      $set: set,
      $setOnInsert: { key: SETTINGS_KEY },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
      lean: true,
    },
  ).lean<UnknownRecord>();

  return normaliseSettings(stored ?? null);
}

/** Settings reads must never break an invitation or reset flow. */
export async function safePlatformSettings(): Promise<PlatformSettingsView> {
  try {
    return await getPlatformSettings();
  } catch (error) {
    console.error("[settings] failed to load platform settings", error);
    return normaliseSettings(null);
  }
}
