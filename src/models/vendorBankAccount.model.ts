import mongoose, { HydratedDocument, InferSchemaType } from "mongoose";

export const BANK_ACCOUNT_VERIFICATION_STATUSES = [
  "pending",
  "verified",
  "rejected",
] as const;
export type BankAccountVerificationStatus =
  (typeof BANK_ACCOUNT_VERIFICATION_STATUSES)[number];

export const BANK_ACCOUNT_SOURCES = ["store_settlement", "vendor"] as const;
export type BankAccountSource = (typeof BANK_ACCOUNT_SOURCES)[number];

/**
 * A settlement account the vendor can withdraw to.
 *
 * The store's onboarding settlement account is promoted into this collection
 * (lazily, on first read) so the vendor portal never invents a second source of
 * truth. Accounts are never "verified" by the browser: the store settlement
 * account inherits the KYB review of an approved store, while vendor-added
 * accounts stay `pending` until an administrator verifies them. Bank-account
 * name resolution is not implemented, so nothing here claims it happened.
 */
const vendorBankAccountSchema = new mongoose.Schema(
  {
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
    bankName: { type: String, required: true, trim: true, maxlength: 120 },
    bankCode: { type: String, required: true, trim: true },
    accountName: { type: String, required: true, trim: true, maxlength: 160 },
    accountNumber: { type: String, required: true, trim: true },
    isDefault: { type: Boolean, default: false, index: true },
    verificationStatus: {
      type: String,
      enum: [...BANK_ACCOUNT_VERIFICATION_STATUSES],
      default: "pending",
      index: true,
    },
    source: {
      type: String,
      enum: [...BANK_ACCOUNT_SOURCES],
      default: "vendor",
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    verifiedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: null, maxlength: 500 },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// A vendor cannot register the same account twice while it is active.
vendorBankAccountSchema.index(
  { vendor: 1, bankCode: 1, accountNumber: 1 },
  {
    unique: true,
    partialFilterExpression: { archivedAt: null },
    name: "vendor_bank_account_unique",
  },
);
vendorBankAccountSchema.index({ vendor: 1, createdAt: -1 });

export type VendorBankAccountType = InferSchemaType<
  typeof vendorBankAccountSchema
>;

const VendorBankAccount = mongoose.model(
  "VendorBankAccount",
  vendorBankAccountSchema,
);

export default VendorBankAccount;
export type VendorBankAccountDocument = HydratedDocument<VendorBankAccountType>;
