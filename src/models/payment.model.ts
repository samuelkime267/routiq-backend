import mongoose, { HydratedDocument, InferSchemaType } from "mongoose";

export const PAYMENT_STATUSES = [
  "pending",
  "successful",
  "failed",
  "refunded",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_CHANNELS = [
  "card",
  "bank_transfer",
  "ussd",
  "wallet",
] as const;
export type PaymentChannel = (typeof PAYMENT_CHANNELS)[number];

/**
 * A payment attempt for an order.
 *
 * `platformFee` is the marketplace revenue recognised for this payment and is
 * calculated once when the payment is created (7.5% of the amount). The
 * dashboard sums this stored value instead of recomputing commission.
 */
const paymentSchema = new mongoose.Schema(
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
    customer: {
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
    /** Whole Naira. */
    amount: { type: Number, required: true, min: 0 },
    platformFee: { type: Number, required: true, min: 0, default: 0 },
    vendorAmount: { type: Number, required: true, min: 0, default: 0 },
    currency: { type: String, default: "NGN" },
    status: {
      type: String,
      enum: [...PAYMENT_STATUSES],
      default: "pending",
      index: true,
    },
    channel: {
      type: String,
      enum: [...PAYMENT_CHANNELS],
      default: "card",
    },
    paidAt: { type: Date, default: null, index: true },
    failureReason: { type: String, default: null },
  },
  { timestamps: true },
);

paymentSchema.index({ status: 1, paidAt: -1 });
paymentSchema.index({ status: 1, createdAt: -1 });

export type PaymentType = InferSchemaType<typeof paymentSchema>;

const Payment = mongoose.model("Payment", paymentSchema);

export default Payment;
export type PaymentDocument = HydratedDocument<PaymentType>;
