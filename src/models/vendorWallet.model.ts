import mongoose, { HydratedDocument, InferSchemaType } from "mongoose";

/**
 * Per-vendor balance bookkeeping and withdrawal lock.
 *
 * The payment + escrow ledgers remain authoritative for money. This document
 * only exists to make withdrawal reservation atomic across API instances: a
 * request must acquire the short-lived lease below before it reads the
 * ledger-derived balance and inserts a withdrawal. The cached totals are a
 * diagnostic snapshot, refreshed every time a withdrawal is requested.
 */
const vendorWalletSchema = new mongoose.Schema(
  {
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    store: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      default: null,
    },
    lockOwner: { type: String, default: null },
    lockExpiresAt: { type: Date, default: null, index: true },
    /** Diagnostic snapshots; the ledger is still the source of truth. */
    availableBalance: { type: Number, default: 0, min: 0 },
    pendingWithdrawalBalance: { type: Number, default: 0, min: 0 },
    lifetimeWithdrawn: { type: Number, default: 0, min: 0 },
    lastReconciledAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export type VendorWalletType = InferSchemaType<typeof vendorWalletSchema>;

const VendorWallet = mongoose.model("VendorWallet", vendorWalletSchema);

export default VendorWallet;
export type VendorWalletDocument = HydratedDocument<VendorWalletType>;
