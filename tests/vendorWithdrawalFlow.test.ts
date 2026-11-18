import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  withdrawFindOne,
  withdrawCreate,
  withdrawExists,
  withdrawFindById,
  withdrawFindOneAndUpdate,
  accountFindOne,
  walletFindOneAndUpdate,
  walletUpdateOne,
  ledger,
  recordActivity,
  recordAudit,
  notifyVendor,
} = vi.hoisted(() => ({
  withdrawFindOne: vi.fn(),
  withdrawCreate: vi.fn(),
  withdrawExists: vi.fn(),
  withdrawFindById: vi.fn(),
  withdrawFindOneAndUpdate: vi.fn(),
  accountFindOne: vi.fn(),
  walletFindOneAndUpdate: vi.fn(),
  walletUpdateOne: vi.fn(),
  ledger: vi.fn(),
  recordActivity: vi.fn(),
  recordAudit: vi.fn(),
  notifyVendor: vi.fn(),
}));

vi.mock("@/models/store.model", () => ({ default: {} }));
vi.mock("@/models/user.model", () => ({ default: { find: vi.fn() } }));
vi.mock("@/models/vendorBankAccount.model", () => ({
  default: {
    findOne: accountFindOne,
    create: vi.fn(),
    countDocuments: vi.fn(),
    updateMany: vi.fn(),
    deleteOne: vi.fn(),
    find: vi.fn(),
  },
}));
vi.mock("@/models/vendorWallet.model", () => ({
  default: {
    findOneAndUpdate: walletFindOneAndUpdate,
    updateOne: walletUpdateOne,
  },
}));
vi.mock("@/models/withdrawal.model", () => ({
  default: {
    findOne: withdrawFindOne,
    create: withdrawCreate,
    exists: withdrawExists,
    findById: withdrawFindById,
    findOneAndUpdate: withdrawFindOneAndUpdate,
    countDocuments: vi.fn(),
    find: vi.fn(),
    aggregate: vi.fn(),
  },
  OPEN_WITHDRAWAL_STATUSES: ["pending", "approved", "processing"],
  WITHDRAWAL_STATUSES: [
    "pending",
    "approved",
    "processing",
    "paid",
    "rejected",
    "cancelled",
  ],
}));
vi.mock("@/lib/activity", () => ({
  recordActivity,
  actorFromUser: vi.fn(() => ({ id: "vendor-1", name: "Ada", role: "vendor" })),
}));
vi.mock("@/lib/audit", () => ({
  recordAudit,
  auditActorFromUser: vi.fn(() => ({ id: "admin-1", name: "Admin" })),
}));
vi.mock("@/services/notifications/notify", () => ({ notifyVendor }));
vi.mock("@/services/vendorPortal/finance", () => ({
  computeVendorLedger: ledger,
}));

import {
  cancelVendorWithdrawal,
  createWithdrawal,
  decideWithdrawal,
} from "@/services/vendorPortal/withdrawals";

const vendor = { _id: "vendor-1", name: "Ada", role: "vendor" };
const store = { _id: "store-1", status: "approved" };
const account = {
  _id: "account-1",
  vendor: "vendor-1",
  verificationStatus: "verified",
  bankName: "GTBank",
  bankCode: "058",
  accountName: "Ada Obi",
  accountNumber: "0123456789",
};

const ledgerTotals = (availableBalance: number) => ({
  grossSales: 0,
  platformFees: 0,
  netEarnings: 0,
  refunds: 0,
  refundedEarnings: 0,
  pendingEarnings: 0,
  settledEarnings: availableBalance,
  withdrawn: 0,
  withdrawalPending: 0,
  availableBalance,
  adjustments: 0,
  successfulPayments: 0,
  refundedPayments: 0,
  heldEscrows: 0,
});

describe("withdrawal request flow", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    accountFindOne.mockResolvedValue(account);
    withdrawFindOne.mockResolvedValue(null);
    withdrawExists.mockResolvedValue(null);
    walletFindOneAndUpdate.mockImplementation(
      (_filter: unknown, update: { $set: { lockOwner: string } }) => ({
        lockOwner: update.$set.lockOwner,
      }),
    );
    walletUpdateOne.mockResolvedValue({});
    ledger.mockResolvedValue(ledgerTotals(50000));
  });

  it("reserves the requested amount against the ledger balance", async () => {
    withdrawCreate.mockResolvedValue({
      _id: "withdrawal-1",
      reference: "WD-1",
      amount: 20000,
    });

    const result = await createWithdrawal(vendor as never, store as never, {
      amount: 20000,
      bankAccountId: "account-1",
    });

    expect(result.created).toBe(true);
    expect(withdrawCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 20000,
        status: "pending",
        balanceBefore: 50000,
        balanceAfter: 30000,
      }),
    );
    expect(walletUpdateOne).toHaveBeenCalled();
  });

  it("rejects an amount above the available balance without creating a row", async () => {
    await expect(
      createWithdrawal(vendor as never, store as never, {
        amount: 60000,
        bankAccountId: "account-1",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(withdrawCreate).not.toHaveBeenCalled();
  });

  it("returns the original record when an idempotency key is replayed", async () => {
    withdrawFindOne.mockResolvedValueOnce({
      _id: "withdrawal-1",
      reference: "WD-1",
      amount: 20000,
    });

    const result = await createWithdrawal(vendor as never, store as never, {
      amount: 20000,
      bankAccountId: "account-1",
      idempotencyKey: "checkout-attempt-1",
    });

    expect(result.created).toBe(false);
    expect(withdrawCreate).not.toHaveBeenCalled();
  });

  it("only lets a pending request be cancelled", async () => {
    const withdrawal = {
      vendor: "vendor-1",
      status: "approved",
      reference: "WD-1",
      amount: 20000,
      history: [],
      save: vi.fn(),
    };

    await expect(
      cancelVendorWithdrawal(vendor as never, withdrawal as never, "changed my mind"),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("administrative withdrawal decisions", () => {
  const admin = {
    _id: "admin-1",
    name: "Admin",
    role: "admin",
    adminRole: "FINANCE_ADMIN",
  };

  beforeEach(() => {
    vi.resetAllMocks();
    ledger.mockResolvedValue(ledgerTotals(50000));
  });

  it("requires a confirmed payout reference before marking a request paid", async () => {
    withdrawFindById.mockResolvedValue({
      _id: "withdrawal-1",
      status: "processing",
      amount: 20000,
      reference: "WD-1",
    });

    await expect(
      decideWithdrawal(admin as never, "withdrawal-1", { action: "paid" }),
    ).rejects.toMatchObject({ statusCode: 422 });

    expect(withdrawFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("rejects a status transition the current state does not allow", async () => {
    withdrawFindById.mockResolvedValue({
      _id: "withdrawal-1",
      status: "paid",
      amount: 20000,
      reference: "WD-1",
    });

    await expect(
      decideWithdrawal(admin as never, "withdrawal-1", {
        action: "approve",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("reports a conflict when another reviewer changed the request first", async () => {
    withdrawFindById.mockResolvedValue({
      _id: "withdrawal-1",
      status: "pending",
      amount: 20000,
      reference: "WD-1",
      vendor: "vendor-1",
      store: "store-1",
    });
    withdrawFindOneAndUpdate.mockResolvedValue(null);

    await expect(
      decideWithdrawal(admin as never, "withdrawal-1", { action: "approve" }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("records an audit entry and notifies the vendor after a paid decision", async () => {
    withdrawFindById.mockResolvedValue({
      _id: "withdrawal-1",
      status: "processing",
      amount: 20000,
      reference: "WD-1",
      vendor: "vendor-1",
      store: "store-1",
      bankSnapshot: {
        bankName: "GTBank",
        accountNumber: "0123456789",
      },
    });
    withdrawFindOneAndUpdate.mockResolvedValue({
      _id: "withdrawal-1",
      status: "paid",
      amount: 20000,
      reference: "WD-1",
      vendor: "vendor-1",
      store: "store-1",
      payoutReference: "PAYOUT-123",
      bankSnapshot: {
        bankName: "GTBank",
        accountNumber: "0123456789",
      },
    });

    const result = await decideWithdrawal(admin as never, "withdrawal-1", {
      action: "paid",
      payoutReference: "PAYOUT-123",
    });

    expect(result.withdrawal.status).toBe("paid");
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "withdrawal.paid",
        entityType: "withdrawal",
      }),
    );
    expect(notifyVendor).toHaveBeenCalledWith(
      expect.objectContaining({ type: "withdrawal_paid" }),
    );
  });
});
