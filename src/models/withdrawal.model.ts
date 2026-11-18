import mongoose, { HydratedDocument, InferSchemaType } from "mongoose";

export const WITHDRAWAL_STATUSES = [
  "pending",
  "approved",
  "processing",
  "paid",
  "rejected",
  "cancelled",
] as const;
export type WithdrawalStatus = (typeof WITHDRAWAL_STATUSES)[number];

/**
 * Withdrawal statuses that reserve money from the vendor's settled balance.
 * A paid request stays in the list for reconciliation but is subtracted through
 * `paid`, not through the reservation bucket.
 */
export const OPEN_WITHDRAWAL_STATUSES = [
  "pending",
  "approved",
  "processing",
] as const;

export const WITHDRAWAL_HISTORY_ACTIONS = [
  "requested",
  "approved",
  "processing",
  "paid",
  "rejected",
  "cancelled",
] as const;
export type WithdrawalHistoryAction =
  (typeof WITHDRAWAL_HISTORY_ACTIONS)[number];

const withdrawalBankSnapshotSchema = new mongoose.Schema(
  {
    bankName: { type: String, required: true, trim: true },
    bankCode: { type: String, required: true, trim: true },
    accountName: { type: String, required: true, trim: true },
    accountNumber: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const withdrawalHistorySchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: [...WITHDRAWAL_HISTORY_ACTIONS],
      required: true,
    },
    fromStatus: {
      type: String,
      enum: [...WITHDRAWAL_STATUSES],
      default: null,
    },
    toStatus: {
      type: String,
      enum: [...WITHDRAWAL_STATUSES],
      required: true,
    },
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    actorRole: {
      type: String,
      enum: ["vendor", "admin", "system"],
      default: "system",
    },
    reason: { type: String, default: null, maxlength: 500 },
    occurredAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

/**
 * Vendor payout request.
 *
 * The balance is not stored on the vendor account. Every request snapshots the
 * ledger-derived balance (`balanceBefore`/`balanceAfter`) so the payment ledger
 * stays the single source of truth, and the bank details are snapshotted so a
 * later account edit cannot rewrite where money was sent.
 *
 * `idempotencyKey` is supplied by the client (or derived by the API) and is
 * unique per vendor. Replaying the same request returns the original record
 * instead of reserving the balance twice.
 */
const withdrawalSchema = new mongoose.Schema(
  {
    reference: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    vendor: {
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
    /** Whole Naira. */
    amount: { type: Number, required: true, min: 1 },
    currency: { type: String, default: "NGN" },
    status: {
      type: String,
      enum: [...WITHDRAWAL_STATUSES],
      default: "pending",
      index: true,
    },
    bankAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VendorBankAccount",
      required: true,
    },
    bankSnapshot: { type: withdrawalBankSnapshotSchema, required: true },
    /**
     * Ledger-derived available balance immediately before and after this
     * request was reserved. Used for audit and reconciliation.
     */
    balanceBefore: { type: Number, required: true, min: 0 },
    balanceAfter: { type: Number, required: true, min: 0 },
    idempotencyKey: { type: String, default: null, trim: true },
    requestedAt: { type: Date, default: Date.now, index: true },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: { type: Date, default: null },
    approvedAt: { type: Date, default: null },
    processingAt: { type: Date, default: null },
    paidAt: { type: Date, default: null, index: true },
    rejectedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    rejectionReason: { type: String, default: null, maxlength: 500 },
    payoutReference: { type: String, default: null, trim: true },
    adminNote: { type: String, default: null, maxlength: 1000 },
    history: { type: [withdrawalHistorySchema], default: [] },
  },
  { timestamps: true },
);

withdrawalSchema.index({ vendor: 1, createdAt: -1 });
withdrawalSchema.index({ status: 1, createdAt: -1 });
withdrawalSchema.index({ vendor: 1, status: 1 });
withdrawalSchema.index(
  { vendor: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: "string" } },
    name: "withdrawal_idempotency",
  },
);

export type WithdrawalType = InferSchemaType<typeof withdrawalSchema>;

const Withdrawal = mongoose.model("Withdrawal", withdrawalSchema);

export default Withdrawal;
export type WithdrawalDocument = HydratedDocument<WithdrawalType>;
