import mongoose, { HydratedDocument, InferSchemaType } from "mongoose";

export const ESCROW_STATUSES = ["held", "released", "refunded"] as const;
export type EscrowStatus = (typeof ESCROW_STATUSES)[number];

/**
 * Escrow ledger entry for a successful payment.
 *
 * Money enters escrow when the payment succeeds and is released to the vendor
 * after delivery (or refunded). Escrow holds the vendor's proceeds (order total
 * less platform commission). The escrow balance is therefore
 * `amountHeld - amountReleased - amountRefunded` across entries still `held`;
 * it is deliberately separate from GMV and recognised marketplace revenue.
 */
const escrowSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      unique: true,
    },
    payment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
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
    /** Whole Naira amounts. */
    amountHeld: { type: Number, required: true, min: 0 },
    amountReleased: { type: Number, default: 0, min: 0 },
    amountRefunded: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: [...ESCROW_STATUSES],
      default: "held",
      index: true,
    },
    heldAt: { type: Date, default: Date.now, index: true },
    releaseDueAt: { type: Date, default: null },
    releasedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

escrowSchema.index({ status: 1, heldAt: -1 });

export type EscrowType = InferSchemaType<typeof escrowSchema>;

const Escrow = mongoose.model("Escrow", escrowSchema);

export default Escrow;
export type EscrowDocument = HydratedDocument<EscrowType>;
