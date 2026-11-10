import mongoose, { HydratedDocument, InferSchemaType } from "mongoose";

/**
 * Canonical dispute lifecycle.
 *
 * The marketplace previously stored lowercase values (`open`, `investigating`,
 * `resolved`, `closed`). Those records are still readable and are normalised by
 * `normalizeDisputeStatus`, so this is an additive change rather than a second
 * dispute system.
 */
export const DISPUTE_STATUSES = [
  "OPEN",
  "UNDER_REVIEW",
  "AWAITING_INFORMATION",
  "RESOLVED",
  "CLOSED",
] as const;
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

/** Statuses that still need administrative attention. */
export const UNRESOLVED_DISPUTE_STATUSES = [
  "OPEN",
  "UNDER_REVIEW",
  "AWAITING_INFORMATION",
] as const;

/** Disputes that have reached a terminal state. */
export const RESOLVED_DISPUTE_STATUSES = ["RESOLVED", "CLOSED"] as const;

const LEGACY_STATUS_ALIASES: Record<string, DisputeStatus> = {
  open: "OPEN",
  investigating: "UNDER_REVIEW",
  awaiting_information: "AWAITING_INFORMATION",
  resolved: "RESOLVED",
  closed: "CLOSED",
};

/**
 * Normalises a stored status into the canonical uppercase value. Unknown values
 * return `null` instead of guessing, so the caller can decide how to display
 * legacy data.
 */
export function normalizeDisputeStatus(
  value?: string | null,
): DisputeStatus | null {
  if (!value) return null;

  const trimmed = value.trim();
  if ((DISPUTE_STATUSES as readonly string[]).includes(trimmed)) {
    return trimmed as DisputeStatus;
  }

  return LEGACY_STATUS_ALIASES[trimmed.toLowerCase()] ?? null;
}

/**
 * Every stored value that represents a canonical status. Queries use this so a
 * filter for `OPEN` still finds legacy `open` documents.
 */
export function disputeStatusVariants(
  status: DisputeStatus,
): string[] {
  const aliases = Object.entries(LEGACY_STATUS_ALIASES)
    .filter(([, canonical]) => canonical === status)
    .map(([legacy]) => legacy);

  return [status, ...aliases];
}

export const DISPUTE_CATEGORIES = [
  "payment",
  "order",
  "delivery",
  "product",
  "vendor",
] as const;
export type DisputeCategory = (typeof DISPUTE_CATEGORIES)[number];

/**
 * `type` values are kept for existing records and integrations. New disputes
 * always carry a `category`; `disputeCategoryFor` resolves legacy records.
 */
export const DISPUTE_TYPES = [
  "payment",
  "order",
  "delivery",
  "product",
  "vendor",
  "non_delivery",
  "damaged_item",
  "wrong_item",
  "refund",
  "other",
] as const;
export type DisputeType = (typeof DISPUTE_TYPES)[number];

export const DISPUTE_PRIORITIES = ["low", "medium", "high"] as const;
export type DisputePriority = (typeof DISPUTE_PRIORITIES)[number];

const LEGACY_TYPE_CATEGORY: Record<string, DisputeCategory> = {
  payment: "payment",
  refund: "payment",
  order: "order",
  other: "order",
  delivery: "delivery",
  non_delivery: "delivery",
  product: "product",
  damaged_item: "product",
  wrong_item: "product",
  vendor: "vendor",
};

export function disputeCategoryFor(
  type?: string | null,
  category?: string | null,
): DisputeCategory {
  if (
    category &&
    (DISPUTE_CATEGORIES as readonly string[]).includes(category)
  ) {
    return category as DisputeCategory;
  }

  return LEGACY_TYPE_CATEGORY[(type ?? "").toLowerCase()] ?? "order";
}

export const DISPUTE_HISTORY_ACTIONS = [
  "created",
  "assigned",
  "status_changed",
  "note_added",
  "information_requested",
  "resolved",
  "closed",
] as const;
export type DisputeHistoryAction = (typeof DISPUTE_HISTORY_ACTIONS)[number];

const disputeEvidenceSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true, maxlength: 160 },
    url: { type: String, default: null, trim: true },
    note: { type: String, default: null, maxlength: 1000 },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const disputeNoteSchema = new mongoose.Schema(
  {
    body: { type: String, required: true, trim: true, maxlength: 2000 },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const disputeHistorySchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: [...DISPUTE_HISTORY_ACTIONS],
      required: true,
    },
    fromStatus: { type: String, default: null },
    toStatus: { type: String, default: null },
    note: { type: String, default: null, maxlength: 2000 },
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const disputeSchema = new mongoose.Schema(
  {
    reference: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    raisedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    store: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: true,
      index: true,
    },
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [...DISPUTE_TYPES],
      required: true,
    },
    /** Canonical support category. Legacy rows resolve through the helper. */
    category: {
      type: String,
      enum: [...DISPUTE_CATEGORIES],
      default: "order",
      index: true,
    },
    status: {
      type: String,
      enum: [...DISPUTE_STATUSES],
      default: "OPEN",
      index: true,
    },
    priority: {
      type: String,
      enum: [...DISPUTE_PRIORITIES],
      default: "medium",
    },
    subject: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, default: null, maxlength: 2000 },
    resolution: { type: String, default: null, maxlength: 2000 },
    resolvedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    assignedAt: { type: Date, default: null },
    informationRequest: { type: String, default: null, maxlength: 2000 },
    evidence: { type: [disputeEvidenceSchema], default: [] },
    notes: { type: [disputeNoteSchema], default: [] },
    history: { type: [disputeHistorySchema], default: [] },
  },
  { timestamps: true },
);

disputeSchema.index({ status: 1, createdAt: -1 });
disputeSchema.index({ category: 1, createdAt: -1 });
disputeSchema.index({ assignedTo: 1, status: 1 });

export type DisputeTypeShape = InferSchemaType<typeof disputeSchema>;

const Dispute = mongoose.model("Dispute", disputeSchema);

export default Dispute;
export type DisputeDocument = HydratedDocument<DisputeTypeShape>;
