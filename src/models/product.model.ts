import mongoose, { HydratedDocument, InferSchemaType } from "mongoose";

export const PRODUCT_STATUSES = [
  "draft",
  "pending",
  "approved",
  "rejected",
  "suspended",
  "archived",
] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

/**
 * Publication is deliberately separate from moderation. Approval only means
 * the listing passed catalogue review; the vendor still decides whether the
 * product is visible in the marketplace.
 */
export const PRODUCT_PUBLICATION_STATUSES = [
  "unpublished",
  "published",
] as const;
export type ProductPublicationStatus =
  (typeof PRODUCT_PUBLICATION_STATUSES)[number];

/**
 * Catalogue listing. Products are owned by a store (the selling surface) and a
 * vendor (the account responsible for them). `pending` is the moderation queue
 * that the admin dashboard reports on.
 */
const productSchema = new mongoose.Schema(
  {
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
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 140,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    sku: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    category: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      default: null,
      maxlength: 2000,
    },
    /** Whole Naira. */
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    compareAtPrice: {
      type: Number,
      default: null,
      min: 0,
    },
    stock: {
      type: Number,
      default: 0,
      min: 0,
    },
    images: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: [...PRODUCT_STATUSES],
      default: "draft",
      index: true,
    },
    /**
     * Set by the vendor after approval. Moderation actions never change this
     * field, so an approved listing does not become available automatically.
     */
    publicationStatus: {
      type: String,
      enum: [...PRODUCT_PUBLICATION_STATUSES],
      default: "unpublished",
      index: true,
    },
    rejectionReason: {
      type: String,
      default: null,
    },
    suspensionReason: {
      type: String,
      default: null,
    },
    suspendedAt: {
      type: Date,
      default: null,
    },
    suspendedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    /** Moderation status to return to when a suspension is restored. */
    previousStatus: {
      type: String,
      enum: [...PRODUCT_STATUSES],
      default: null,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

productSchema.index({ status: 1, createdAt: -1 });
productSchema.index({ store: 1, status: 1 });
productSchema.index({ publicationStatus: 1, status: 1 });

export type ProductType = InferSchemaType<typeof productSchema>;

const Product = mongoose.model("Product", productSchema);

export default Product;
export type ProductDocument = HydratedDocument<ProductType>;
