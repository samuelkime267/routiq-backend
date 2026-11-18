import type { StoreDocument } from "@/models/store.model";
import type { UserDocument } from "@/models/user.model";
import { actorFromUser, recordActivity } from "@/lib/activity";
import { createError } from "@/utils";
import type { UpdateVendorSettingsInput } from "@/schemas/vendorPortal";
import { storeAccessSummary } from "./access";

const pad = (value?: string | null) => value ?? "";

function maskAccountNumber(value?: string | null) {
  const digits = pad(value);

  if (digits.length < 4) return digits;

  return `${"•".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

/**
 * Vendor-facing settings.
 *
 * Identity, legal documents, representative details and the settlement account
 * are not editable here: they are part of the reviewed store application. The
 * portal only exposes presentation fields, contact details and operations.
 */
export function vendorSettingsSnapshot(
  vendor: UserDocument,
  store: StoreDocument,
) {
  return {
    profile: {
      id: String(vendor._id),
      name: vendor.name,
      email: vendor.email,
      username: vendor.username ?? null,
      phone: vendor.phone ?? null,
      profilePicture: vendor.profilePicture ?? null,
    },
    store: {
      id: String(store._id),
      name: store.name,
      slug: store.slug,
      status: store.status,
      category: store.category,
      description: store.description ?? null,
      phoneNumber: store.phoneNumber,
      email: store.email,
      logo: store.logo ?? null,
      coverImage: store.coverImage ?? null,
      address: store.address ?? null,
      pickupInstructions: store.pickupInstructions ?? null,
      operatingHours: (store.operatingHours ?? []).map((hour) => ({
        day: hour.day,
        isOpen: hour.isOpen,
        openingTime: hour.openingTime ?? null,
        closingTime: hour.closingTime ?? null,
      })),
      submittedAt: store.submittedAt ?? null,
      reviewedAt: store.reviewedAt ?? null,
      rejectionReason: store.rejectionReason ?? null,
      suspensionReason: store.suspensionReason ?? null,
    },
    payout: {
      bankName: store.settlementAccount?.bankName ?? null,
      accountName: store.settlementAccount?.accountName ?? null,
      accountNumber: maskAccountNumber(store.settlementAccount?.accountNumber),
      verified: store.status === "approved",
    },
    access: storeAccessSummary(store),
    editable: {
      profile: true,
      storefront: true,
      operations: true,
      legalIdentity: false,
      settlementAccount: false,
      reason:
        "Legal identity, documents, representative details and the settlement account are locked to your reviewed store application. Contact support to change them.",
    },
  };
}

export async function updateVendorSettings(
  vendor: UserDocument,
  store: StoreDocument,
  input: UpdateVendorSettingsInput,
) {
  const changed: string[] = [];

  if (input.profile) {
    if (input.profile.name !== undefined) {
      vendor.name = input.profile.name;
      changed.push("profile.name");
    }
    if (input.profile.phone !== undefined) {
      vendor.phone = input.profile.phone || null;
      changed.push("profile.phone");
    }
    if (input.profile.profilePicture !== undefined) {
      vendor.profilePicture = input.profile.profilePicture || null;
      changed.push("profile.profilePicture");
    }

    await vendor.save();
  }

  if (input.storefront) {
    if (input.storefront.description !== undefined) {
      store.description = input.storefront.description || null;
      changed.push("store.description");
    }
    if (input.storefront.phoneNumber !== undefined) {
      store.phoneNumber = input.storefront.phoneNumber;
      changed.push("store.phoneNumber");
    }
    if (input.storefront.logo !== undefined) {
      store.logo = input.storefront.logo || null;
      changed.push("store.logo");
    }
    if (input.storefront.coverImage !== undefined) {
      store.coverImage = input.storefront.coverImage || null;
      changed.push("store.coverImage");
    }
  }

  if (input.operations) {
    if (input.operations.pickupInstructions !== undefined) {
      store.pickupInstructions = input.operations.pickupInstructions || null;
      changed.push("store.pickupInstructions");
    }
    if (input.operations.operatingHours !== undefined) {
      for (const hour of input.operations.operatingHours) {
        if (hour.isOpen && (!hour.openingTime || !hour.closingTime)) {
          throw createError(
            `Add both opening and closing times for ${hour.day}`,
            422,
          );
        }
      }

      store.operatingHours = input.operations.operatingHours.map((hour) => ({
        day: hour.day,
        isOpen: hour.isOpen,
        openingTime: hour.isOpen ? (hour.openingTime ?? null) : null,
        closingTime: hour.isOpen ? (hour.closingTime ?? null) : null,
      })) as never;
      changed.push("store.operatingHours");
    }
  }

  if (input.profile || input.storefront || input.operations) {
    await store.save();
  }

  await recordActivity({
    type: "admin_action",
    channel: "marketplace",
    title: "Settings updated",
    description: `Updated ${changed.length} setting${changed.length === 1 ? "" : "s"}.`,
    actor: actorFromUser(vendor),
    subject: { type: "store", id: store._id, label: store.name },
    href: "/settings",
    metadata: { changed },
  });

  return vendorSettingsSnapshot(vendor, store);
}
