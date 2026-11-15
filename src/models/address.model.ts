import mongoose, { HydratedDocument, InferSchemaType } from "mongoose";
import { NIGERIAN_STATES } from "@/config/nigeria";

/**
 * Customer delivery address.
 *
 * Addresses are owned by the customer account, not by a checkout. The same
 * address can therefore be selected for several orders and edited without
 * rewriting the address snapshot already captured on historical orders.
 */
export const ADDRESS_VALIDATION_STATUSES = [
  "unverified",
  "valid",
  "invalid",
] as const;
export type AddressValidationStatus =
  (typeof ADDRESS_VALIDATION_STATUSES)[number];

const addressValidationSchema = new mongoose.Schema(
  {
    /** Provider that supplied the verdict (`shipbubble`), or null for local. */
    provider: { type: String, default: null, trim: true },
    status: {
      type: String,
      enum: [...ADDRESS_VALIDATION_STATUSES],
      default: "unverified",
    },
    message: { type: String, default: null, trim: true },
    /** Provider address code reused by delivery rate lookups. */
    addressCode: { type: String, default: null, trim: true },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    validatedAt: { type: Date, default: null },
  },
  { _id: false },
);

const addressSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    label: {
      type: String,
      default: "Home",
      trim: true,
      maxlength: 40,
    },
    recipientName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    phone: { type: String, required: true, trim: true },
    street: {
      type: String,
      required: true,
      trim: true,
      maxlength: 240,
    },
    city: { type: String, required: true, trim: true, maxlength: 120 },
    lga: { type: String, required: true, trim: true, maxlength: 120 },
    state: {
      type: String,
      enum: [...NIGERIAN_STATES],
      required: true,
    },
    country: { type: String, default: "Nigeria", trim: true },
    landmark: { type: String, default: null, trim: true, maxlength: 240 },
    postalCode: { type: String, default: null, trim: true, maxlength: 20 },
    isDefault: { type: Boolean, default: false, index: true },
    validation: { type: addressValidationSchema, default: () => ({}) },
    lastUsedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

addressSchema.index({ customer: 1, createdAt: -1 });
/**
 * A customer can only have one default address. The partial index makes the
 * rule explicit at the storage layer; the service still clears the previous
 * default so the index never rejects a normal edit.
 */
addressSchema.index(
  { customer: 1, isDefault: 1 },
  { unique: true, partialFilterExpression: { isDefault: true } },
);

export type AddressType = InferSchemaType<typeof addressSchema>;

const Address = mongoose.model("Address", addressSchema);

export default Address;
export type AddressDocument = HydratedDocument<AddressType>;
