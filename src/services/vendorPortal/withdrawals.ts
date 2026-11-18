import crypto from "node:crypto";
import mongoose from "mongoose";
import Store, { type StoreDocument } from "@/models/store.model";
import User, { type UserDocument } from "@/models/user.model";
import VendorBankAccount, {
  type VendorBankAccountDocument,
} from "@/models/vendorBankAccount.model";
import VendorWallet from "@/models/vendorWallet.model";
import Withdrawal, {
  OPEN_WITHDRAWAL_STATUSES,
  WITHDRAWAL_STATUSES,
  type WithdrawalDocument,
  type WithdrawalStatus,
} from "@/models/withdrawal.model";
import { actorFromUser, recordActivity } from "@/lib/activity";
import {
  auditActorFromUser,
  recordAudit,
  type AuditRequestMeta,
} from "@/lib/audit";
import { createError } from "@/utils";
import { notifyVendor } from "@/services/notifications/notify";
import {
  computeVendorLedger,
  type VendorLedgerTotals,
} from "./finance";
import type {
  AdminWithdrawalListQuery,
  CreateBankAccountInput,
  UpdateBankAccountInput,
  VendorWithdrawalListQuery,
} from "@/schemas/vendorPortal";

const LOCK_TTL_MS = 15_000;
const LOCK_ATTEMPTS = 6;

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const regex = (value: string) => new RegExp(escapeRegExp(value), "i");

function reference() {
  return `WD-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-${crypto
    .randomInt(100000, 999999)}`;
}

async function uniqueReference() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = reference();

    if (!(await Withdrawal.exists({ reference: candidate }))) return candidate;
  }

  throw createError("Could not allocate a withdrawal reference", 500);
}

function endOfDayIfDateOnly(value: string) {
  const date = new Date(value);

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    date.setUTCHours(23, 59, 59, 999);
  }

  return date;
}

export interface WithdrawalSummary {
  total: number;
  byStatus: Record<WithdrawalStatus, number>;
  amounts: Record<WithdrawalStatus, number>;
  reserved: number;
  paid: number;
}

function emptyWithdrawalSummary(): WithdrawalSummary {
  return {
    total: 0,
    byStatus: {
      pending: 0,
      approved: 0,
      processing: 0,
      paid: 0,
      rejected: 0,
      cancelled: 0,
    },
    amounts: {
      pending: 0,
      approved: 0,
      processing: 0,
      paid: 0,
      rejected: 0,
      cancelled: 0,
    },
    reserved: 0,
    paid: 0,
  };
}

async function withdrawalSummaryFor(
  filter: Record<string, unknown>,
): Promise<WithdrawalSummary> {
  const rows = await Withdrawal.aggregate<{
    _id: WithdrawalStatus;
    count: number;
    amount: number;
  }>([
    { $match: filter },
    { $group: { _id: "$status", count: { $sum: 1 }, amount: { $sum: "$amount" } } },
  ]);

  const summary = emptyWithdrawalSummary();

  for (const row of rows) {
    summary.total += row.count;
    if (row._id in summary.byStatus) {
      summary.byStatus[row._id] = row.count;
      summary.amounts[row._id] = row.amount;
    }
    if ((OPEN_WITHDRAWAL_STATUSES as readonly string[]).includes(row._id)) {
      summary.reserved += row.amount;
    }
    if (row._id === "paid") summary.paid += row.amount;
  }

  return summary;
}

/**
 * Promotes the store's reviewed settlement account into the bank-account
 * collection. The store account inherits approval because it was part of the
 * KYB review; vendor-added accounts never do.
 */
export async function ensureSettlementBankAccount(
  vendorId: string,
  store: StoreDocument,
): Promise<VendorBankAccountDocument | null> {
  const existing = await VendorBankAccount.findOne({
    vendor: vendorId,
    archivedAt: null,
  }).sort({ isDefault: -1, createdAt: 1 });

  if (existing) return existing;

  const settlement = store.settlementAccount;

  if (!settlement?.bankName || !settlement.accountNumber) return null;

  try {
    return await VendorBankAccount.create({
      vendor: vendorId,
      store: store._id,
      bankName: settlement.bankName,
      bankCode: settlement.bankCode,
      accountName: settlement.accountName,
      accountNumber: settlement.accountNumber,
      isDefault: true,
      source: "store_settlement",
      verificationStatus: store.status === "approved" ? "verified" : "pending",
      verifiedAt: store.status === "approved" ? new Date() : null,
    });
  } catch (error) {
    // A concurrent first read may have created it already.
    if ((error as { code?: number }).code === 11000) {
      return VendorBankAccount.findOne({
        vendor: vendorId,
        archivedAt: null,
      }).sort({ isDefault: -1, createdAt: 1 });
    }

    throw error;
  }
}

export async function listVendorBankAccounts(
  vendorId: string,
  store: StoreDocument,
) {
  await ensureSettlementBankAccount(vendorId, store);

  const accounts = await VendorBankAccount.find({
    vendor: vendorId,
    archivedAt: null,
  })
    .sort({ isDefault: -1, createdAt: 1 })
    .lean();

  return {
    accounts,
    defaultAccountId:
      accounts.find((account) => account.isDefault)?._id ?? accounts[0]?._id ?? null,
    hasVerifiedAccount: accounts.some(
      (account) => account.verificationStatus === "verified",
    ),
  };
}

export async function createBankAccount(
  vendor: Pick<UserDocument, "_id" | "name" | "role">,
  store: StoreDocument,
  input: CreateBankAccountInput,
) {
  if (["draft", "closed"].includes(store.status)) {
    throw createError(
      "Add a bank account after your store application has been submitted.",
      400,
    );
  }

  const existing = await VendorBankAccount.findOne({
    vendor: vendor._id,
    bankCode: input.bankCode,
    accountNumber: input.accountNumber,
    archivedAt: null,
  });

  if (existing) {
    throw createError(
      "That bank account is already on your payout profile",
      409,
    );
  }

  const count = await VendorBankAccount.countDocuments({
    vendor: vendor._id,
    archivedAt: null,
  });

  const account = await VendorBankAccount.create({
    vendor: vendor._id,
    store: store._id,
    ...input,
    isDefault: count === 0,
    source: "vendor",
    // Bank-account name resolution is not integrated, so a new account is
    // never presented as verified until an administrator approves it.
    verificationStatus: "pending",
  });

  await recordActivity({
    type: "withdrawal_requested",
    channel: "marketplace",
    title: "Bank account added",
    description: `${input.bankName} account ending ${input.accountNumber.slice(-4)} was added to the payout profile.`,
    actor: actorFromUser(vendor),
    subject: { type: "withdrawal", id: account._id, label: input.bankName },
    href: "/finance/bank-accounts",
  });

  return account;
}

export async function updateBankAccount(
  vendorId: string,
  account: VendorBankAccountDocument,
  input: UpdateBankAccountInput,
) {
  if (account.vendor.toString() !== vendorId) {
    throw createError("Bank account not found", 404);
  }

  if (account.source === "store_settlement") {
    throw createError(
      "Your original settlement account is part of your verified store application. Add a new account and make it default instead of editing it.",
      400,
    );
  }

  const changesIdentity =
    (input.accountNumber && input.accountNumber !== account.accountNumber) ||
    (input.bankCode && input.bankCode !== account.bankCode) ||
    (input.accountName && input.accountName !== account.accountName);

  for (const field of [
    "bankName",
    "bankCode",
    "accountName",
    "accountNumber",
  ] as const) {
    if (input[field] !== undefined) account[field] = input[field];
  }

  if (changesIdentity) {
    account.verificationStatus = "pending";
    account.verifiedAt = null;
    account.verifiedBy = null;
    account.rejectionReason = null;
  }

  await account.save();

  if (input.isDefault) {
    await setDefaultBankAccount(vendorId, account);
  }

  return account;
}

export async function setDefaultBankAccount(
  vendorId: string,
  account: VendorBankAccountDocument,
) {
  if (account.vendor.toString() !== vendorId) {
    throw createError("Bank account not found", 404);
  }

  await VendorBankAccount.updateMany(
    { vendor: vendorId, archivedAt: null },
    { $set: { isDefault: false } },
  );
  account.isDefault = true;
  await account.save();

  return account;
}

export async function deleteBankAccount(
  vendorId: string,
  account: VendorBankAccountDocument,
) {
  if (account.vendor.toString() !== vendorId) {
    throw createError("Bank account not found", 404);
  }

  if (account.source === "store_settlement") {
    throw createError(
      "The settlement account from your store application cannot be removed.",
      400,
    );
  }

  const used = await Withdrawal.exists({
    bankAccount: account._id,
    status: { $in: [...WITHDRAWAL_STATUSES] },
  });

  if (used) {
    account.archivedAt = new Date();
    account.isDefault = false;
    await account.save();
  } else {
    await VendorBankAccount.deleteOne({ _id: account._id });
  }

  if (account.isDefault) {
    const fallback = await VendorBankAccount.findOne({
      vendor: vendorId,
      archivedAt: null,
    }).sort({ createdAt: 1 });

    if (fallback) {
      fallback.isDefault = true;
      await fallback.save();
    }
  }

  return { deleted: true, archived: Boolean(used) };
}

async function acquireVendorLock(vendorId: string, storeId: string) {
  const owner = crypto.randomUUID();

  for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt += 1) {
    const now = new Date();

    try {
      const wallet = await VendorWallet.findOneAndUpdate(
        {
          vendor: vendorId,
          $or: [{ lockExpiresAt: null }, { lockExpiresAt: { $lte: now } }],
        },
        {
          $set: {
            store: storeId,
            lockOwner: owner,
            lockExpiresAt: new Date(now.getTime() + LOCK_TTL_MS),
          },
          $setOnInsert: { vendor: vendorId },
        },
        { upsert: true, new: true },
      );

      if (wallet?.lockOwner === owner) return owner;
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
    }
  }

  throw createError(
    "Another withdrawal request is being processed. Please try again in a moment.",
    409,
  );
}

async function releaseVendorLock(vendorId: string, owner: string) {
  await VendorWallet.updateOne(
    { vendor: vendorId, lockOwner: owner },
    { $set: { lockOwner: null, lockExpiresAt: null } },
  );
}

async function refreshWalletSnapshot(
  vendorId: string,
  storeId: string,
  ledger: VendorLedgerTotals,
) {
  await VendorWallet.updateOne(
    { vendor: vendorId },
    {
      $set: {
        store: storeId,
        availableBalance: ledger.availableBalance,
        pendingWithdrawalBalance: ledger.withdrawalPending,
        lifetimeWithdrawn: ledger.withdrawn,
        lastReconciledAt: new Date(),
      },
      $setOnInsert: { vendor: vendorId },
    },
    { upsert: true },
  );
}

export interface CreateWithdrawalResult {
  withdrawal: WithdrawalDocument;
  created: boolean;
  ledger: VendorLedgerTotals;
}

export async function createWithdrawal(
  vendor: Pick<UserDocument, "_id" | "name" | "role">,
  store: StoreDocument,
  input: {
    amount: number;
    bankAccountId: string;
    idempotencyKey?: string;
    note?: string;
  },
): Promise<CreateWithdrawalResult> {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw createError("Enter a valid withdrawal amount", 400);
  }

  const account = await VendorBankAccount.findOne({
    _id: input.bankAccountId,
    vendor: vendor._id,
    archivedAt: null,
  });

  if (!account) throw createError("Bank account not found", 404);

  if (account.verificationStatus !== "verified") {
    throw createError(
      "This bank account is still awaiting verification. Choose a verified account or contact support.",
      400,
    );
  }

  const idempotencyKey = input.idempotencyKey?.trim() || null;

  if (idempotencyKey) {
    const existing = await Withdrawal.findOne({
      vendor: vendor._id,
      idempotencyKey,
    });

    if (existing) {
      return {
        withdrawal: existing,
        created: false,
        ledger: await computeVendorLedger(String(vendor._id)),
      };
    }
  }

  const lockOwner = await acquireVendorLock(
    String(vendor._id),
    String(store._id),
  );

  try {
    // Re-check inside the lock: a duplicate request may have completed while
    // this caller was waiting for the lease.
    if (idempotencyKey) {
      const existing = await Withdrawal.findOne({
        vendor: vendor._id,
        idempotencyKey,
      });

      if (existing) {
        return {
          withdrawal: existing,
          created: false,
          ledger: await computeVendorLedger(String(vendor._id)),
        };
      }
    }

    const ledger = await computeVendorLedger(String(vendor._id));

    if (input.amount > ledger.availableBalance) {
      throw createError(
        `You can withdraw at most ₦${ledger.availableBalance.toLocaleString("en-NG")} right now.`,
        400,
      );
    }

    let withdrawal: WithdrawalDocument;

    try {
      withdrawal = await Withdrawal.create({
        reference: await uniqueReference(),
        vendor: vendor._id,
        store: store._id,
        amount: input.amount,
        status: "pending",
        bankAccount: account._id,
        bankSnapshot: {
          bankName: account.bankName,
          bankCode: account.bankCode,
          accountName: account.accountName,
          accountNumber: account.accountNumber,
        },
        balanceBefore: ledger.availableBalance,
        balanceAfter: ledger.availableBalance - input.amount,
        idempotencyKey,
        adminNote: input.note ?? null,
        requestedAt: new Date(),
        history: [
          {
            action: "requested",
            fromStatus: null,
            toStatus: "pending",
            actor: vendor._id,
            actorRole: "vendor",
            reason: input.note ?? null,
            occurredAt: new Date(),
          },
        ],
      });
    } catch (error) {
      if (idempotencyKey && (error as { code?: number }).code === 11000) {
        const existing = await Withdrawal.findOne({
          vendor: vendor._id,
          idempotencyKey,
        });

        if (existing) {
          return {
            withdrawal: existing,
            created: false,
            ledger: await computeVendorLedger(String(vendor._id)),
          };
        }
      }

      throw error;
    }

    const after = await computeVendorLedger(String(vendor._id));
    await refreshWalletSnapshot(String(vendor._id), String(store._id), after);

    await Promise.all([
      notifyVendor({
        recipient: vendor._id,
        type: "withdrawal_submitted",
        title: "Withdrawal request received",
        message: `We received your ₦${input.amount.toLocaleString("en-NG")} withdrawal request. It is now awaiting review.`,
        href: "/finance/withdrawals",
        metadata: { withdrawal: String(withdrawal._id) },
      }),
      recordActivity({
        type: "withdrawal_requested",
        channel: "marketplace",
        title: "Withdrawal requested",
        description: `₦${input.amount.toLocaleString("en-NG")} was requested to ${account.bankName} ending ${account.accountNumber.slice(-4)}.`,
        actor: actorFromUser(vendor),
        subject: {
          type: "withdrawal",
          id: withdrawal._id,
          label: withdrawal.reference,
        },
        href: "/finance/withdrawals",
        metadata: { amount: input.amount },
      }),
    ]);

    return { withdrawal, created: true, ledger: after };
  } finally {
    await releaseVendorLock(String(vendor._id), lockOwner);
  }
}

export async function listVendorWithdrawals(
  vendorId: string,
  query: VendorWithdrawalListQuery,
) {
  const filter: Record<string, unknown> = { vendor: vendorId };

  if (query.status) filter.status = query.status;
  if (query.search) {
    filter.$or = [
      { reference: regex(query.search) },
      { "bankSnapshot.bankName": regex(query.search) },
      { "bankSnapshot.accountNumber": regex(query.search) },
      { payoutReference: regex(query.search) },
    ];
  }
  if (query.createdFrom || query.createdTo) {
    const createdAt: Record<string, Date> = {};
    if (query.createdFrom) createdAt.$gte = new Date(query.createdFrom);
    if (query.createdTo) createdAt.$lte = endOfDayIfDateOnly(query.createdTo);
    filter.createdAt = createdAt;
  }

  const skip = (query.page - 1) * query.limit;
  const direction = query.sortOrder === "asc" ? 1 : -1;

  const [withdrawals, total, summary, ledger] = await Promise.all([
    Withdrawal.find(filter)
      .sort({ [query.sortBy]: direction, _id: direction })
      .skip(skip)
      .limit(query.limit)
      .lean(),
    Withdrawal.countDocuments(filter),
    withdrawalSummaryFor({ vendor: new mongoose.Types.ObjectId(vendorId) }),
    computeVendorLedger(vendorId),
  ]);

  return {
    withdrawals,
    summary,
    balance: {
      availableBalance: ledger.availableBalance,
      settledEarnings: ledger.settledEarnings,
      reserved: ledger.withdrawalPending,
      withdrawn: ledger.withdrawn,
    },
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.ceil(total / query.limit),
    },
  };
}

export async function getVendorWithdrawal(
  vendorId: string,
  withdrawalId: string,
) {
  if (!/^[a-f\d]{24}$/i.test(withdrawalId)) {
    throw createError("Withdrawal not found", 404);
  }

  const withdrawal = await Withdrawal.findOne({
    _id: withdrawalId,
    vendor: vendorId,
  }).lean();

  if (!withdrawal) throw createError("Withdrawal not found", 404);

  return withdrawal;
}

export async function findVendorWithdrawalDocument(
  vendorId: string,
  withdrawalId: string,
) {
  if (!/^[a-f\d]{24}$/i.test(withdrawalId)) {
    throw createError("Withdrawal not found", 404);
  }

  const withdrawal = await Withdrawal.findOne({
    _id: withdrawalId,
    vendor: vendorId,
  });

  if (!withdrawal) throw createError("Withdrawal not found", 404);

  return withdrawal;
}

export async function findVendorBankAccountDocument(
  vendorId: string,
  accountId: string,
) {
  if (!/^[a-f\d]{24}$/i.test(accountId)) {
    throw createError("Bank account not found", 404);
  }

  const account = await VendorBankAccount.findOne({
    _id: accountId,
    vendor: vendorId,
    archivedAt: null,
  });

  if (!account) throw createError("Bank account not found", 404);

  return account;
}

export async function cancelVendorWithdrawal(
  vendor: Pick<UserDocument, "_id" | "name" | "role">,
  withdrawal: WithdrawalDocument,
  reason?: string | null,
) {
  if (withdrawal.vendor.toString() !== String(vendor._id)) {
    throw createError("Withdrawal not found", 404);
  }

  if (withdrawal.status !== "pending") {
    throw createError(
      `A ${withdrawal.status} withdrawal cannot be cancelled. Contact support if you need help.`,
      400,
    );
  }

  withdrawal.status = "cancelled";
  withdrawal.cancelledAt = new Date();
  withdrawal.history.push({
    action: "cancelled",
    fromStatus: "pending",
    toStatus: "cancelled",
    actor: vendor._id,
    actorRole: "vendor",
    reason: reason ?? null,
    occurredAt: new Date(),
  });
  await withdrawal.save();

  const ledger = await computeVendorLedger(String(vendor._id));

  await Promise.all([
    recordActivity({
      type: "withdrawal_rejected",
      channel: "marketplace",
      title: "Withdrawal cancelled",
      description: `${withdrawal.reference} was cancelled by the vendor.`,
      actor: actorFromUser(vendor),
      subject: {
        type: "withdrawal",
        id: withdrawal._id,
        label: withdrawal.reference,
      },
      href: "/finance/withdrawals",
    }),
    notifyVendor({
      recipient: vendor._id,
      type: "withdrawal_rejected",
      title: "Withdrawal cancelled",
      message: `Your ₦${withdrawal.amount.toLocaleString("en-NG")} withdrawal request was cancelled. The balance is available again.`,
      href: "/finance/withdrawals",
      metadata: { withdrawal: String(withdrawal._id) },
    }),
  ]);

  return { withdrawal, ledger };
}

/* -------------------------------------------------------------------------- */
/* Administration                                                             */
/* -------------------------------------------------------------------------- */

export async function queryAdminWithdrawals(query: AdminWithdrawalListQuery) {
  const filter: Record<string, unknown> = {};

  if (query.status) filter.status = query.status;
  if (query.scope === "open") {
    filter.status = { $in: [...OPEN_WITHDRAWAL_STATUSES] };
  }
  if (query.scope === "settled") {
    filter.status = { $in: ["paid", "rejected", "cancelled"] };
  }

  if (query.vendor) {
    if (/^[a-f\d]{24}$/i.test(query.vendor)) {
      filter.vendor = new mongoose.Types.ObjectId(query.vendor);
    } else {
      const [vendorIds, storeIds] = await Promise.all([
        User.find({
          $or: [{ name: regex(query.vendor) }, { email: regex(query.vendor) }],
        }).distinct("_id"),
        Store.find({ name: regex(query.vendor) }).distinct("_id"),
      ]);
      filter.$or = [
        { vendor: { $in: vendorIds } },
        { store: { $in: storeIds } },
        { "bankSnapshot.accountName": regex(query.vendor) },
      ];
    }
  }

  if (query.search) {
    const pattern = regex(query.search);
    const [vendorIds, orderClauses] = await Promise.all([
      User.find({
        $or: [{ name: pattern }, { email: pattern }],
      }).distinct("_id"),
      Promise.resolve([] as Record<string, unknown>[]),
    ]);

    orderClauses.push(
      { reference: pattern },
      { payoutReference: pattern },
      { "bankSnapshot.bankName": pattern },
      { "bankSnapshot.accountNumber": pattern },
      { vendor: { $in: vendorIds } },
    );
    filter.$and = [...((filter.$and as unknown[]) ?? []), { $or: orderClauses }];
  }

  if (query.createdFrom || query.createdTo) {
    const createdAt: Record<string, Date> = {};
    if (query.createdFrom) createdAt.$gte = new Date(query.createdFrom);
    if (query.createdTo) createdAt.$lte = endOfDayIfDateOnly(query.createdTo);
    filter.createdAt = createdAt;
  }

  const skip = (query.page - 1) * query.limit;
  const direction = query.sortOrder === "asc" ? 1 : -1;

  const [withdrawals, total, summary] = await Promise.all([
    Withdrawal.find(filter)
      .populate("vendor", "name email phone status")
      .populate("store", "name slug status logo")
      .populate("reviewedBy", "name email adminRole")
      .sort({ [query.sortBy]: direction, _id: direction })
      .skip(skip)
      .limit(query.limit)
      .lean(),
    Withdrawal.countDocuments(filter),
    withdrawalSummaryFor({}),
  ]);

  return {
    withdrawals,
    summary,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.ceil(total / query.limit),
    },
  };
}

export async function getAdminWithdrawal(withdrawalId: string) {
  if (!/^[a-f\d]{24}$/i.test(withdrawalId)) {
    throw createError("Withdrawal not found", 404);
  }

  const withdrawal = await Withdrawal.findById(withdrawalId)
    .populate("vendor", "name email phone status role")
    .populate("store", "name slug status logo settlementAccount")
    .populate("bankAccount")
    .populate("reviewedBy", "name email adminRole")
    .lean();

  if (!withdrawal) throw createError("Withdrawal not found", 404);

  return withdrawal;
}

const DECISION_TRANSITIONS: Record<
  "approve" | "reject" | "processing" | "paid",
  { from: readonly WithdrawalStatus[]; to: WithdrawalStatus; action: string }
> = {
  approve: { from: ["pending"], to: "approved", action: "approved" },
  processing: {
    from: ["approved"],
    to: "processing",
    action: "processing",
  },
  paid: {
    from: ["approved", "processing"],
    to: "paid",
    action: "paid",
  },
  reject: {
    from: ["pending", "approved", "processing"],
    to: "rejected",
    action: "rejected",
  },
};

export interface AdminDecisionInput {
  action: "approve" | "reject" | "processing" | "paid";
  reason?: string;
  payoutReference?: string;
  adminNote?: string;
}

export async function decideWithdrawal(
  actor: {
    _id?: unknown;
    name?: string | null;
    email?: string | null;
    role?: string | null;
    adminRole?: string | null;
  },
  withdrawalId: string,
  input: AdminDecisionInput,
  request?: AuditRequestMeta,
) {
  const current = await Withdrawal.findById(withdrawalId);

  if (!current) throw createError("Withdrawal not found", 404);

  const transition = DECISION_TRANSITIONS[input.action];

  if (!transition.from.includes(current.status)) {
    throw createError(
      `A ${current.status} withdrawal cannot be ${transition.to}. Allowed from: ${transition.from.join(", ")}.`,
      400,
    );
  }

  if (input.action === "reject" && !input.reason?.trim()) {
    throw createError("A rejection reason is required", 422);
  }

  if (input.action === "paid" && !input.payoutReference?.trim()) {
    throw createError(
      "A payout reference is required before a withdrawal can be marked paid. Only mark it paid after the transfer is confirmed.",
      422,
    );
  }

  const now = new Date();
  const update: Record<string, unknown> = {
    status: transition.to,
    history: {
      action: transition.action,
      fromStatus: current.status,
      toStatus: transition.to,
      actor: actor._id ?? null,
      actorRole: "admin",
      reason: input.reason ?? null,
      occurredAt: now,
    },
  };

  if (input.action === "approve") {
    update.reviewedBy = actor._id ?? null;
    update.reviewedAt = now;
    update.approvedAt = now;
  }
  if (input.action === "processing") update.processingAt = now;
  if (input.action === "paid") {
    update.paidAt = now;
    update.payoutReference = input.payoutReference?.trim();
  }
  if (input.action === "reject") {
    update.rejectedAt = now;
    update.rejectionReason = input.reason?.trim();
    update.reviewedBy = actor._id ?? null;
    update.reviewedAt = now;
  }
  if (input.adminNote?.trim()) update.adminNote = input.adminNote.trim();

  const previousState = {
    status: current.status,
    amount: current.amount,
    reference: current.reference,
  };

  // The status guard makes concurrent decisions safe: only one caller can move
  // the request out of the state it read.
  const updated = await Withdrawal.findOneAndUpdate(
    { _id: current._id, status: current.status },
    { $set: update, $push: { history: update.history as never } },
    { new: true },
  );

  if (!updated) {
    throw createError(
      "This withdrawal changed while you were reviewing it. Reload and try again.",
      409,
    );
  }

  const ledger = await computeVendorLedger(String(updated.vendor));

  await Promise.all([
    recordAudit({
      actor: auditActorFromUser(actor),
      action: `withdrawal.${transition.action}`,
      entityType: "withdrawal",
      entityId: updated._id,
      entityLabel: updated.reference,
      previousState,
      newState: {
        status: updated.status,
        amount: updated.amount,
        payoutReference: updated.payoutReference ?? null,
      },
      reason: input.reason ?? null,
      metadata: { availableBalance: ledger.availableBalance },
      request,
    }),
    notifyVendor({
      recipient: updated.vendor,
      type:
        input.action === "reject"
          ? "withdrawal_rejected"
          : input.action === "paid"
            ? "withdrawal_paid"
            : "withdrawal_approved",
      title:
        input.action === "reject"
          ? "Withdrawal rejected"
          : input.action === "paid"
            ? "Withdrawal paid"
            : "Withdrawal approved",
      message:
        input.action === "reject"
          ? `Your ₦${updated.amount.toLocaleString("en-NG")} withdrawal was rejected: ${input.reason}`
          : input.action === "paid"
            ? `₦${updated.amount.toLocaleString("en-NG")} was paid to ${updated.bankSnapshot.bankName} ending ${updated.bankSnapshot.accountNumber.slice(-4)}.`
            : `Your ₦${updated.amount.toLocaleString("en-NG")} withdrawal was approved and is being prepared for payout.`,
      href: "/finance/withdrawals",
      metadata: { withdrawal: String(updated._id) },
    }),
    recordActivity({
      type:
        input.action === "paid"
          ? "withdrawal_paid"
          : input.action === "reject"
            ? "withdrawal_rejected"
            : "withdrawal_approved",
      channel: "administration",
      title: `Withdrawal ${transition.action}`,
      description: `${updated.reference} for ₦${updated.amount.toLocaleString("en-NG")} was ${transition.action}.`,
      actor: actorFromUser(actor),
      subject: {
        type: "withdrawal",
        id: updated._id,
        label: updated.reference,
      },
      href: "/withdrawals",
      metadata: { status: updated.status },
    }),
  ]);

  await refreshWalletSnapshot(
    String(updated.vendor),
    String(updated.store),
    ledger,
  );

  return { withdrawal: updated, ledger };
}

export async function verifyVendorBankAccount(
  actor: {
    _id?: unknown;
    name?: string | null;
    email?: string | null;
    role?: string | null;
    adminRole?: string | null;
  },
  accountId: string,
  input: { status: "verified" | "rejected"; reason?: string },
  request?: AuditRequestMeta,
) {
  if (!/^[a-f\d]{24}$/i.test(accountId)) {
    throw createError("Bank account not found", 404);
  }

  const account = await VendorBankAccount.findOne({
    _id: accountId,
    archivedAt: null,
  });

  if (!account) throw createError("Bank account not found", 404);

  account.verificationStatus = input.status;
  account.verifiedBy = (actor._id as never) ?? null;
  account.verifiedAt = new Date();
  account.rejectionReason =
    input.status === "rejected" ? (input.reason?.trim() ?? null) : null;
  await account.save();

  await Promise.all([
    recordAudit({
      actor: auditActorFromUser(actor),
      action: `withdrawal.bank_account_${input.status}`,
      entityType: "withdrawal",
      entityId: account._id,
      entityLabel: `${account.bankName} ••••${account.accountNumber.slice(-4)}`,
      previousState: { verificationStatus: "pending" },
      newState: { verificationStatus: input.status },
      reason: input.reason ?? null,
      request,
    }),
    notifyVendor({
      recipient: account.vendor,
      type:
        input.status === "verified"
          ? "bank_account_verified"
          : "bank_account_rejected",
      title:
        input.status === "verified"
          ? "Bank account verified"
          : "Bank account rejected",
      message:
        input.status === "verified"
          ? `${account.bankName} ending ${account.accountNumber.slice(-4)} can now receive withdrawals.`
          : `${account.bankName} ending ${account.accountNumber.slice(-4)} could not be verified: ${input.reason ?? "contact support"}`,
      href: "/finance/bank-accounts",
      metadata: { bankAccount: String(account._id) },
    }),
  ]);

  return account;
}

export async function queryAdminBankAccounts() {
  const accounts = await VendorBankAccount.find({ archivedAt: null })
    .populate("vendor", "name email status")
    .populate("store", "name slug status")
    .sort({ verificationStatus: 1, createdAt: -1 })
    .limit(200)
    .lean();

  return { accounts };
}
