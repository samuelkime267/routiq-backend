import mongoose, { HydratedDocument, InferSchemaType } from "mongoose";

export const DISPUTE_STATUSES = [
  "open",
  "investigating",
  "resolved",
  "closed",
] as const;
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

/** A dispute still needs administrative attention. */
export const UNRESOLVED_DISPUTE_STATUSES = ["open", "investigating"] as const;

export const DISPUTE_TYPES = [
  "non_delivery",
  "damaged_item",
  "wrong_item",
  "refund",
  "payment",
  "other",
] as const;
export type DisputeType = (typeof DISPUTE_TYPES)[number];

export const DISPUTE_PRIORITIES = ["low", "medium", "high"] as const;
export type DisputePriority = (typeof DISPUTE_PRIORITIES)[number];

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
    status: {
      type: String,
      enum: [...DISPUTE_STATUSES],
      default: "open",
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
  },
  { timestamps: true },
);

disputeSchema.index({ status: 1, createdAt: -1 });

export type DisputeTypeShape = InferSchemaType<typeof disputeSchema>;

const Dispute = mongoose.model("Dispute", disputeSchema);

export default Dispute;
export type DisputeDocument = HydratedDocument<DisputeTypeShape>;
