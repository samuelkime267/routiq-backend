import mongoose, { HydratedDocument, InferSchemaType } from "mongoose";
import { STORE_STATUSES } from "./store.model";

export const STORE_REVIEW_ACTIONS = [
  "submitted",
  "resubmitted",
  "approved",
  "rejected",
  "information_requested",
  "suspended",
  "reactivated",
  "closed",
] as const;
export type StoreReviewAction = (typeof STORE_REVIEW_ACTIONS)[number];

export const STORE_REVIEW_ACTOR_ROLES = ["admin", "vendor", "system"] as const;
export type StoreReviewActorRole =
  (typeof STORE_REVIEW_ACTOR_ROLES)[number];

/**
 * Append-only verification trail for a store.
 *
 * Vendor submissions and every administrative decision are stored here so the
 * review page and vendor profile can show who changed what, when, and why
 * without reconstructing history from the activity feed.
 */
const storeReviewSchema = new mongoose.Schema(
  {
    store: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: true,
      index: true,
    },
    action: {
      type: String,
      enum: [...STORE_REVIEW_ACTIONS],
      required: true,
      index: true,
    },
    fromStatus: {
      type: String,
      enum: [...STORE_STATUSES],
      default: null,
    },
    toStatus: {
      type: String,
      enum: [...STORE_STATUSES],
      default: null,
    },
    reason: {
      type: String,
      default: null,
      maxlength: 1000,
    },
    message: {
      type: String,
      default: null,
      maxlength: 2000,
    },
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    actorRole: {
      type: String,
      enum: [...STORE_REVIEW_ACTOR_ROLES],
      default: "system",
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true },
);

storeReviewSchema.index({ store: 1, createdAt: -1 });

export type StoreReviewType = InferSchemaType<typeof storeReviewSchema>;

const StoreReview = mongoose.model("StoreReview", storeReviewSchema);

export default StoreReview;
export type StoreReviewDocument = HydratedDocument<StoreReviewType>;
