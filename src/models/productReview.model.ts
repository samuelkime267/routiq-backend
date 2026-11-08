import mongoose, { HydratedDocument, InferSchemaType } from "mongoose";
import { PRODUCT_STATUSES } from "./product.model";

export const PRODUCT_REVIEW_ACTIONS = [
  "submitted",
  "approved",
  "rejected",
  "suspended",
  "restored",
] as const;
export type ProductReviewAction = (typeof PRODUCT_REVIEW_ACTIONS)[number];

export const PRODUCT_REVIEW_ACTOR_ROLES = ["admin", "vendor", "system"] as const;
export type ProductReviewActorRole =
  (typeof PRODUCT_REVIEW_ACTOR_ROLES)[number];

/**
 * Append-only moderation trail for a product.
 *
 * Every administrative decision is stored here so the admin product page can
 * show who changed the moderation state, when, and why without reconstructing
 * history from the activity feed.
 */
const productReviewSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    action: {
      type: String,
      enum: [...PRODUCT_REVIEW_ACTIONS],
      required: true,
      index: true,
    },
    fromStatus: {
      type: String,
      enum: [...PRODUCT_STATUSES],
      default: null,
    },
    toStatus: {
      type: String,
      enum: [...PRODUCT_STATUSES],
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
      enum: [...PRODUCT_REVIEW_ACTOR_ROLES],
      default: "system",
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true },
);

productReviewSchema.index({ product: 1, createdAt: -1 });

export type ProductReviewType = InferSchemaType<typeof productReviewSchema>;

const ProductReview = mongoose.model("ProductReview", productReviewSchema);

export default ProductReview;
export type ProductReviewDocument = HydratedDocument<ProductReviewType>;
