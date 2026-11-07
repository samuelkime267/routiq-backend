import type { StoreDocument, StoreStatus } from "@/models/store.model";
import { BusinessType } from "@/models/store.model";
import StoreReview, {
  type StoreReviewAction,
} from "@/models/storeReview.model";
import { actorFromUser, recordActivity } from "@/lib/activity";
import { createError } from "@/utils";
import { notifyVendor } from "@/services/notifications/notify";

export const STORE_ACTIONS = [
  "approve",
  "reject",
  "request_information",
  "suspend",
  "reactivate",
] as const;
export type StoreAction = (typeof STORE_ACTIONS)[number];

interface StoreTransition {
  from: readonly StoreStatus[];
  to: StoreStatus;
}

/**
 * The only legal status changes for the administrative store workflow.
 *
 * `request_information` intentionally stays in `under_review`: the store is
 * already being reviewed, and the vendor's resubmission moves it back to
 * `pending`.
 */
export const STORE_TRANSITIONS: Record<StoreAction, StoreTransition> = {
  approve: { from: ["pending", "under_review"], to: "approved" },
  reject: { from: ["pending", "under_review"], to: "rejected" },
  request_information: {
    from: ["pending", "under_review"],
    to: "under_review",
  },
  suspend: { from: ["approved"], to: "suspended" },
  reactivate: { from: ["suspended"], to: "approved" },
};

const ACTION_LABELS: Record<StoreAction, string> = {
  approve: "approved",
  reject: "rejected",
  request_information: "sent back for information",
  suspend: "suspended",
  reactivate: "reactivated",
};

const REVIEW_ACTIONS: Record<StoreAction, StoreReviewAction> = {
  approve: "approved",
  reject: "rejected",
  request_information: "information_requested",
  suspend: "suspended",
  reactivate: "reactivated",
};

const ACTIVITY_TYPES = {
  approve: "store_approved",
  reject: "store_rejected",
} as const;

export interface StoreActionActor {
  _id?: unknown;
  name?: string | null;
  role?: string | null;
  adminRole?: string | null;
}

export interface StoreReadiness {
  ready: boolean;
  missing: string[];
}

/**
 * Checks the KYB requirements that must be present before a store can be
 * approved. The onboarding validator enforces these on submit, but records can
 * become incomplete after edits or seed imports, so approval re-checks them.
 */
export function getStoreApprovalReadiness(
  store: Pick<
    StoreDocument,
    | "documents"
    | "businessType"
    | "cacRegistrationNumber"
    | "tin"
    | "representative"
    | "settlementAccount"
    | "compliance"
  >,
): StoreReadiness {
  const missing: string[] = [];
  const documents = store.documents ?? [];
  const documentTypes = documents.map((document) => document.type);

  if (!documentTypes.includes("government_id")) {
    missing.push("Government-issued ID document");
  }
  if (!documentTypes.includes("utility_bill")) {
    missing.push("Utility bill or proof of address");
  }

  const isRegisteredBusiness =
    store.businessType !== BusinessType.INDIVIDUAL;

  if (isRegisteredBusiness) {
    if (!store.cacRegistrationNumber) {
      missing.push("CAC registration number");
    }
    if (!store.tin) {
      missing.push("Tax identification number");
    }
    if (
      !documentTypes.includes("cac_certificate") &&
      !documentTypes.includes("business_name_certificate")
    ) {
      missing.push("CAC certificate");
    }
  }

  if (!store.representative?.nin && !store.representative?.bvn) {
    missing.push("Representative NIN or BVN");
  }
  if (!store.settlementAccount?.accountNumber) {
    missing.push("Settlement bank account");
  }
  if (
    !store.compliance?.termsAccepted ||
    !store.compliance?.dataProcessingConsent
  ) {
    missing.push("Marketplace terms and data-processing consent");
  }

  return { ready: missing.length === 0, missing };
}

export function canPerformStoreAction(
  currentStatus: StoreStatus,
  action: StoreAction,
): boolean {
  return STORE_TRANSITIONS[action].from.includes(currentStatus);
}

export function assertStoreAction(
  currentStatus: StoreStatus,
  action: StoreAction,
): void {
  if (canPerformStoreAction(currentStatus, action)) return;

  const allowed = STORE_TRANSITIONS[action].from.join(" or ");

  throw createError(
    `A ${currentStatus} store cannot be ${ACTION_LABELS[action]}. Expected status: ${allowed}.`,
    400,
  );
}

export function assertStoreApprovalReady(
  store: Parameters<typeof getStoreApprovalReadiness>[0],
): void {
  const readiness = getStoreApprovalReadiness(store);

  if (!readiness.ready) {
    throw createError(
      `This store cannot be approved yet. Missing: ${readiness.missing.join(", ")}.`,
      400,
    );
  }
}

export interface PerformStoreActionInput {
  store: StoreDocument;
  action: StoreAction;
  actor: StoreActionActor;
  /** Required for rejection and suspension. */
  reason?: string | null;
  /** Required for information requests. */
  message?: string | null;
  /** Optional reviewer note stored with the review record. */
  note?: string | null;
}

export interface PerformStoreActionResult {
  store: StoreDocument;
  review: unknown;
  fromStatus: StoreStatus;
  toStatus: StoreStatus;
}

/**
 * Applies one administrative decision and records the full trail:
 * status change, append-only review record, audit event and vendor message.
 *
 * The caller is responsible for the permission check; this function enforces
 * the status transition and approval readiness rules.
 */
export async function performStoreAction({
  store,
  action,
  actor,
  reason,
  message,
  note,
}: PerformStoreActionInput): Promise<PerformStoreActionResult> {
  const fromStatus = store.status as StoreStatus;

  assertStoreAction(fromStatus, action);

  if (action === "approve") {
    assertStoreApprovalReady(store);
  }

  const toStatus = STORE_TRANSITIONS[action].to;
  const now = new Date();

  store.status = toStatus;

  if (action === "approve" || action === "reactivate") {
    store.rejectionReason = null;
    store.suspensionReason = null;
    store.suspendedAt = null;
    store.suspendedBy = null;
    store.reviewedAt = now;
    store.reviewedBy = actor._id as never;
  }

  if (action === "reject") {
    store.rejectionReason = reason ?? null;
    store.reviewedAt = now;
    store.reviewedBy = actor._id as never;
  }

  if (action === "request_information") {
    store.reviewedAt = now;
    store.reviewedBy = actor._id as never;
  }

  if (action === "suspend") {
    store.suspensionReason = reason ?? null;
    store.suspendedAt = now;
    store.suspendedBy = actor._id as never;
  }

  await store.save();

  const review = await StoreReview.create({
    store: store._id,
    action: REVIEW_ACTIONS[action],
    fromStatus,
    toStatus,
    reason: reason ?? null,
    message: message ?? null,
    actor: actor._id ?? null,
    actorRole: "admin",
    metadata: note ? { note } : {},
  });

  const description = buildActivityDescription({
    storeName: store.name,
    action,
    reason,
    message,
  });

  await recordActivity({
    type:
      ACTIVITY_TYPES[action as keyof typeof ACTIVITY_TYPES] ?? "admin_action",
    title: activityTitle(action),
    description,
    actor: actorFromUser(actor),
    subject: { type: "store", id: store._id, label: store.name },
    href: `/stores/${String(store._id)}`,
    metadata: {
      action,
      fromStatus,
      toStatus,
      reason: reason ?? null,
      message: message ?? null,
    },
  });

  await notifyVendor({
    recipient: store.owner,
    ...notificationCopy(store, action, { reason, message }),
    href: `/onboarding/${String(store._id)}`,
    metadata: { storeId: String(store._id), action, status: toStatus },
  });

  return { store, review, fromStatus, toStatus };
}

function activityTitle(action: StoreAction) {
  switch (action) {
    case "approve":
      return "Store approved";
    case "reject":
      return "Store rejected";
    case "request_information":
      return "Store information requested";
    case "suspend":
      return "Store suspended";
    case "reactivate":
      return "Store reactivated";
  }
}

function buildActivityDescription(input: {
  storeName: string;
  action: StoreAction;
  reason?: string | null;
  message?: string | null;
}) {
  const { storeName, action, reason, message } = input;

  switch (action) {
    case "approve":
      return `${storeName} was approved and can now trade on Routiq.`;
    case "reject":
      return `${storeName} was rejected. Reason: ${reason ?? "Not provided"}.`;
    case "request_information":
      return `${storeName} was sent back for more information: ${message ?? "Not provided"}.`;
    case "suspend":
      return `${storeName} was suspended. Reason: ${reason ?? "Not provided"}.`;
    case "reactivate":
      return `${storeName} was reactivated and can trade again.`;
  }
}

function notificationCopy(
  store: StoreDocument,
  action: StoreAction,
  input: { reason?: string | null; message?: string | null },
): { type: "store_approved" | "store_rejected" | "store_information_requested" | "store_suspended" | "store_reactivated"; title: string; message: string } {
  switch (action) {
    case "approve":
      return {
        type: "store_approved",
        title: "Your store is approved",
        message: `${store.name} has been approved. You can now publish products and start selling on Routiq.`,
      };
    case "reject":
      return {
        type: "store_rejected",
        title: "Your store application needs changes",
        message: `We could not approve ${store.name} yet. ${input.reason ?? "Please review your details and resubmit."}`,
      };
    case "request_information":
      return {
        type: "store_information_requested",
        title: "More information is needed",
        message: `Our review team needs more information about ${store.name}: ${input.message ?? "Please update your application."}`,
      };
    case "suspend":
      return {
        type: "store_suspended",
        title: "Your store has been suspended",
        message: `${store.name} has been suspended. ${input.reason ?? "Contact support for details."}`,
      };
    case "reactivate":
      return {
        type: "store_reactivated",
        title: "Your store is active again",
        message: `${store.name} has been reactivated. You can resume trading on Routiq.`,
      };
  }
}
