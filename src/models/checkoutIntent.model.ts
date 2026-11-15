import mongoose, { HydratedDocument, InferSchemaType } from "mongoose";

/**
 * Durable idempotency record for one checkout attempt.
 *
 * The customer submits a client-generated `key` with the cart. The unique
 * `(customer, key)` index means a retried request, a double click or a network
 * replay can never create a second set of orders or a second payment
 * initialisation. The record also stores the pricing snapshot that was shown to
 * the customer so a resumed request returns the same numbers.
 */
export const CHECKOUT_INTENT_STATUSES = [
  "creating",
  "created",
  "initialized",
  "paid",
  "failed",
] as const;
export type CheckoutIntentStatus = (typeof CHECKOUT_INTENT_STATUSES)[number];

const checkoutIntentSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    /** Client-generated idempotency key. */
    key: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: [...CHECKOUT_INTENT_STATUSES],
      default: "creating",
      index: true,
    },
    /** Hash of the items, address and delivery selections. */
    fingerprint: { type: String, required: true, trim: true },
    masterOrderNumber: { type: String, required: true, trim: true },
    orders: [{ type: mongoose.Schema.Types.ObjectId, ref: "Order" }],
    payments: [{ type: mongoose.Schema.Types.ObjectId, ref: "Payment" }],
    subtotal: { type: Number, required: true, min: 0 },
    deliveryFee: { type: Number, required: true, min: 0 },
    serviceFee: { type: Number, default: 0, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    /** Pricing/fulfilment snapshot returned by the quote endpoint. */
    snapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    provider: { type: String, default: "paystack", trim: true },
    /** One provider transaction covers every vendor sub-order in the group. */
    providerReference: { type: String, default: null, trim: true, index: true },
    providerTransactionId: { type: String, default: null, trim: true },
    authorizationUrl: { type: String, default: null, trim: true },
    accessCode: { type: String, default: null, trim: true },
    failureReason: { type: String, default: null, trim: true },
    paidAt: { type: Date, default: null, index: true },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true },
);

checkoutIntentSchema.index({ customer: 1, key: 1 }, { unique: true });
checkoutIntentSchema.index({ masterOrderNumber: 1 }, { unique: true });

export type CheckoutIntentType = InferSchemaType<typeof checkoutIntentSchema>;

const CheckoutIntent = mongoose.model("CheckoutIntent", checkoutIntentSchema);

export default CheckoutIntent;
export type CheckoutIntentDocument = HydratedDocument<CheckoutIntentType>;
