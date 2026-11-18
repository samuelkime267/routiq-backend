import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/models/payment.model", () => ({
  default: { aggregate: vi.fn() },
}));
vi.mock("@/models/escrow.model", () => ({
  default: { aggregate: vi.fn() },
}));
vi.mock("@/models/withdrawal.model", () => ({
  default: { aggregate: vi.fn() },
  OPEN_WITHDRAWAL_STATUSES: ["pending", "approved", "processing"],
}));
vi.mock("@/models/order.model", () => ({
  default: { aggregate: vi.fn() },
  GMV_ORDER_STATUSES: ["pending", "confirmed", "processing"],
}));
vi.mock("@/models/product.model", () => ({
  default: { countDocuments: vi.fn(), aggregate: vi.fn() },
}));

import Escrow from "@/models/escrow.model";
import Payment from "@/models/payment.model";
import Withdrawal from "@/models/withdrawal.model";
import {
  computeVendorLedger,
  getVendorFinanceSummary,
} from "@/services/vendorPortal/finance";

const rows = (value: unknown) => value as never;

function mockLedger(input: {
  successful?: {
    amount: number;
    fee: number;
    vendorAmount: number;
    count: number;
  };
  refunded?: {
    amount: number;
    fee: number;
    vendorAmount: number;
    count: number;
  };
  held?: number;
  released?: number;
  heldCount?: number;
  paid?: number;
  open?: number;
}) {
  vi.mocked(Payment.aggregate).mockResolvedValueOnce(
    rows([
      {
        successful: input.successful ? [input.successful] : [],
        refunded: input.refunded ? [input.refunded] : [],
      },
    ]),
  );
  vi.mocked(Escrow.aggregate).mockResolvedValueOnce(
    rows([
      {
        held: input.held ?? 0,
        released: input.released ?? 0,
        heldCount: input.heldCount ?? 0,
      },
    ]),
  );
  vi.mocked(Withdrawal.aggregate).mockResolvedValueOnce(
    rows([
      { _id: "paid", value: input.paid ?? 0, count: input.paid ? 1 : 0 },
      { _id: "pending", value: input.open ?? 0, count: input.open ? 1 : 0 },
    ]),
  );
}

describe("vendor ledger", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("derives every balance from payments, escrow and withdrawals", async () => {
    mockLedger({
      successful: {
        amount: 100000,
        fee: 7500,
        vendorAmount: 92500,
        count: 2,
      },
      refunded: {
        amount: 20000,
        fee: 1500,
        vendorAmount: 18500,
        count: 1,
      },
      held: 30000,
      released: 80000,
      heldCount: 2,
      paid: 20000,
      open: 10000,
    });

    const ledger = await computeVendorLedger("a1b2c3d4e5f6a7b8c9d0e1f2");

    expect(ledger.grossSales).toBe(100000);
    expect(ledger.platformFees).toBe(7500);
    expect(ledger.netEarnings).toBe(74000);
    expect(ledger.refunds).toBe(20000);
    expect(ledger.pendingEarnings).toBe(30000);
    expect(ledger.settledEarnings).toBe(80000);
    expect(ledger.withdrawn).toBe(20000);
    expect(ledger.withdrawalPending).toBe(10000);
    expect(ledger.availableBalance).toBe(50000);
    expect(ledger.adjustments).toBe(0);
  });

  it("never reports a negative available balance", async () => {
    mockLedger({ released: 10000, paid: 20000, open: 5000 });

    const ledger = await computeVendorLedger("a1b2c3d4e5f6a7b8c9d0e1f2");

    expect(ledger.availableBalance).toBe(0);
  });

  it("reconciles the exposed balance with the displayed equation", async () => {
    mockLedger({
      successful: {
        amount: 50000,
        fee: 3750,
        vendorAmount: 46250,
        count: 1,
      },
      released: 46250,
      paid: 10000,
      open: 5000,
    });

    const summary = await getVendorFinanceSummary("a1b2c3d4e5f6a7b8c9d0e1f2");

    expect(summary.reconciliation.matches).toBe(true);
    expect(summary.reconciliation.ledgerAvailable).toBe(
      summary.reconciliation.recomputedAvailable,
    );
    expect(summary.reconciliation.equation).toContain("settled earnings");
    expect(summary.definitions.availableBalance).toMatch(/withdrawal/i);
  });
});
