import {
  PRODUCT_STATUSES,
  type ProductDocument,
  type ProductStatus,
} from "@/models/product.model";
import ProductReview, {
  type ProductReviewAction,
} from "@/models/productReview.model";
import { actorFromUser, recordActivity } from "@/lib/activity";
import { createError } from "@/utils";
import { notifyVendor } from "@/services/notifications/notify";

export const PRODUCT_ACTIONS = [
  "approve",
  "reject",
  "suspend",
  "restore",
] as const;
export type ProductAction = (typeof PRODUCT_ACTIONS)[number];

interface ProductTransition {
  from: readonly ProductStatus[];
  to: ProductStatus;
}

/**
 * The only legal moderation changes for a product.
 *
 * Approval moves a listing out of the moderation queue but deliberately leaves
 * `publicationStatus` alone: the vendor still owns whether the product is
 * visible in the marketplace. Restoration returns a suspended listing to the
 * moderation status it held before suspension.
 */
export const PRODUCT_TRANSITIONS: Record<ProductAction, ProductTransition> = {
  approve: { from: ["pending"], to: "approved" },
  reject: { from: ["pending"], to: "rejected" },
  suspend: { from: ["approved"], to: "suspended" },
  restore: { from: ["suspended"], to: "approved" },
};

const ACTION_LABELS: Record<ProductAction, string> = {
  approve: "approved",
  reject: "rejected",
  suspend: "suspended",
  restore: "restored",
};

const REVIEW_ACTIONS: Record<ProductAction, ProductReviewAction> = {
  approve: "approved",
  reject: "rejected",
  suspend: "suspended",
  restore: "restored",
};

const ACTIVITY_TYPES = {
  approve: "product_approved",
  reject: "product_rejected",
  suspend: "product_suspended",
  restore: "product_restored",
} as const;

export interface ProductActionActor {
  _id?: unknown;
  name?: string | null;
  role?: string | null;
  adminRole?: string | null;
}

export function canPerformProductAction(
  currentStatus: ProductStatus,
  action: ProductAction,
): boolean {
  return PRODUCT_TRANSITIONS[action].from.includes(currentStatus);
}

export function assertProductAction(
  currentStatus: ProductStatus,
  action: ProductAction,
): void {
  if (canPerformProductAction(currentStatus, action)) return;

  const allowed = PRODUCT_TRANSITIONS[action].from.join(" or ");

  throw createError(
    `A ${currentStatus} product cannot be ${ACTION_LABELS[action]}. Expected status: ${allowed}.`,
    400,
  );
}

/** Restores the moderation status the listing held before it was suspended. */
function restoreTarget(previousStatus: unknown): ProductStatus {
  return PRODUCT_STATUSES.includes(previousStatus as ProductStatus) &&
    previousStatus !== "suspended"
    ? (previousStatus as ProductStatus)
    : "approved";
}

export interface PerformProductActionInput {
  product: ProductDocument;
  action: ProductAction;
  actor: ProductActionActor;
  /** Required for rejection and suspension. */
  reason?: string | null;
  /** Optional reviewer note stored with the review record. */
  note?: string | null;
}

export interface PerformProductActionResult {
  product: ProductDocument;
  review: unknown;
  fromStatus: ProductStatus;
  toStatus: ProductStatus;
}

/**
 * Applies one administrative moderation decision and records the full trail:
 * status change, append-only review record, audit event and vendor message.
 *
 * The caller is responsible for the permission check; this function enforces
 * the status transition and the reason requirements.
 */
export async function performProductAction({
  product,
  action,
  actor,
  reason,
  note,
}: PerformProductActionInput): Promise<PerformProductActionResult> {
  const fromStatus = product.status as ProductStatus;

  assertProductAction(fromStatus, action);

  if (
    (action === "reject" || action === "suspend") &&
    (!reason || reason.trim().length < 5)
  ) {
    throw createError(
      action === "reject"
        ? "A rejection reason of at least 5 characters is required."
        : "A suspension reason of at least 5 characters is required.",
      400,
    );
  }

  const now = new Date();
  let toStatus: ProductStatus;

  switch (action) {
    case "approve":
      toStatus = "approved";
      product.rejectionReason = null;
      product.suspensionReason = null;
      product.suspendedAt = null;
      product.suspendedBy = null;
      product.previousStatus = null;
      product.reviewedAt = now;
      product.reviewedBy = actor._id as never;
      break;
    case "reject":
      toStatus = "rejected";
      product.rejectionReason = reason ?? null;
      product.reviewedAt = now;
      product.reviewedBy = actor._id as never;
      break;
    case "suspend":
      toStatus = "suspended";
      product.previousStatus = fromStatus;
      product.suspensionReason = reason ?? null;
      product.suspendedAt = now;
      product.suspendedBy = actor._id as never;
      break;
    case "restore":
      toStatus = restoreTarget(product.previousStatus);
      product.previousStatus = null;
      product.suspensionReason = null;
      product.suspendedAt = null;
      product.suspendedBy = null;
      product.reviewedAt = now;
      product.reviewedBy = actor._id as never;
      break;
  }

  // Publication stays exactly as the vendor left it. Approval must not make a
  // listing visible, and suspension must not silently republish or unpublish.
  product.status = toStatus;
  await product.save();

  const review = await ProductReview.create({
    product: product._id,
    action: REVIEW_ACTIONS[action],
    fromStatus,
    toStatus,
    reason: reason ?? null,
    message: note ?? null,
    actor: actor._id ?? null,
    actorRole: "admin",
    metadata: {
      ...(note ? { note } : {}),
      publicationStatus: product.publicationStatus ?? "unpublished",
    },
  });

  await recordActivity({
    type: ACTIVITY_TYPES[action],
    title: activityTitle(action),
    description: buildActivityDescription({
      productName: product.name,
      action,
      reason,
      note,
    }),
    actor: actorFromUser(actor),
    subject: { type: "product", id: product._id, label: product.name },
    href: `/products/${String(product._id)}`,
    metadata: {
      action,
      fromStatus,
      toStatus,
      reason: reason ?? null,
      note: note ?? null,
      publicationStatus: product.publicationStatus ?? "unpublished",
    },
  });

  await notifyVendor({
    recipient: product.vendor,
    ...notificationCopy(product, action, { reason, note }),
    href: `/products/${String(product._id)}`,
    metadata: {
      productId: String(product._id),
      action,
      status: toStatus,
    },
  });

  return { product, review, fromStatus, toStatus };
}

function activityTitle(action: ProductAction) {
  switch (action) {
    case "approve":
      return "Product approved";
    case "reject":
      return "Product rejected";
    case "suspend":
      return "Product suspended";
    case "restore":
      return "Product restored";
  }
}

function buildActivityDescription(input: {
  productName: string;
  action: ProductAction;
  reason?: string | null;
  note?: string | null;
}) {
  const { productName, action, reason, note } = input;

  switch (action) {
    case "approve":
      return `${productName} passed catalogue moderation.${note ? ` Note: ${note}` : ""}`;
    case "reject":
      return `${productName} was rejected. Reason: ${reason ?? "Not provided"}.`;
    case "suspend":
      return `${productName} was suspended. Reason: ${reason ?? "Not provided"}.`;
    case "restore":
      return `${productName} was restored after suspension.${note ? ` Note: ${note}` : ""}`;
  }
}

function notificationCopy(
  product: ProductDocument,
  action: ProductAction,
  input: { reason?: string | null; note?: string | null },
): {
  type:
    | "product_approved"
    | "product_rejected"
    | "product_suspended"
    | "product_restored";
  title: string;
  message: string;
} {
  switch (action) {
    case "approve":
      return {
        type: "product_approved",
        title: "Your product passed moderation",
        message: `${product.name} is approved. Publish it from your catalogue when you are ready for customers to see it.`,
      };
    case "reject":
      return {
        type: "product_rejected",
        title: "Your product needs changes",
        message: `${product.name} was not approved. ${input.reason ?? "Please review the listing and submit it again."}`,
      };
    case "suspend":
      return {
        type: "product_suspended",
        title: "Your product has been suspended",
        message: `${product.name} has been suspended. ${input.reason ?? "Contact support for details."}`,
      };
    case "restore":
      return {
        type: "product_restored",
        title: "Your product is restored",
        message: `${product.name} has been restored and can be published again.`,
      };
  }
}
