import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/models/order.model", () => ({
  default: { aggregate: vi.fn(), collection: { name: "orders" } },
  GMV_ORDER_STATUSES: ["pending", "confirmed", "delivered"],
}));
vi.mock("@/models/payment.model", () => ({
  default: { aggregate: vi.fn(), collection: { name: "payments" } },
}));
vi.mock("@/models/escrow.model", () => ({
  default: { aggregate: vi.fn(), collection: { name: "escrows" } },
}));
vi.mock("@/models/store.model", () => ({
  default: { collection: { name: "stores" } },
}));
vi.mock("@/models/user.model", () => ({
  default: { collection: { name: "users" } },
}));

import Order from "@/models/order.model";
import Payment from "@/models/payment.model";
import Escrow from "@/models/escrow.model";
import { getFinancialOverview } from "@/services/financials/query";
import { resolveDashboardRange } from "@/services/dashboard/range";

const rows = (value: unknown) => value as never;
const NOW = new Date("2026-11-09T12:00:00.000Z");

describe("financial overview", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("keeps GMV, payment volume, commission, refunds, settlements and escrow separate", async () => {
    // Current period.
    vi.mocked(Order.aggregate).mockReturnValueOnce(
      rows([{ value: 500000, count: 25 }]),
    );
    vi.mocked(Payment.aggregate)
      .mockReturnValueOnce(
        rows([{ value: 420000, commission: 31500, count: 20 }]),
      )
      .mockReturnValueOnce(
        rows([{ value: 50000, commission: 3750, count: 2 }]),
      );
    vi.mocked(Escrow.aggregate)
      .mockReturnValueOnce(rows([{ value: 180000, count: 8 }]))
      .mockReturnValueOnce(rows([{ value: 240000 }]));

    // Previous period.
    vi.mocked(Order.aggregate).mockReturnValueOnce(
      rows([{ value: 400000, count: 20 }]),
    );
    vi.mocked(Payment.aggregate)
      .mockReturnValueOnce(
        rows([{ value: 350000, commission: 26250, count: 16 }]),
      )
      .mockReturnValueOnce(rows([{ value: 0, commission: 0, count: 0 }]));
    vi.mocked(Escrow.aggregate)
      .mockReturnValueOnce(rows([{ value: 150000, count: 7 }]))
      .mockReturnValueOnce(rows([{ value: 240000 }]));

    const range = resolveDashboardRange({ range: "30d" }, NOW);
    const overview = await getFinancialOverview(range);

    expect(overview.totals.gmv).toBe(500000);
    expect(overview.totals.paymentVolume).toBe(420000);
    expect(overview.totals.commission).toBe(31500);
    expect(overview.totals.refundVolume).toBe(50000);
    expect(overview.totals.refundedCommission).toBe(3750);
    expect(overview.totals.settlementVolume).toBe(180000);
    expect(overview.totals.netRevenue).toBe(27750);
    expect(overview.totals.escrowBalance).toBe(240000);

    // Escrow is a liability, never folded into revenue or GMV.
    expect(overview.totals.escrowBalance).not.toBe(overview.totals.netRevenue);
    expect(overview.escrowBasis).toBe("all_time");

    expect(overview.previous.gmv).toBe(400000);
    expect(overview.change.gmv).toBe(25);
  });

  it("never reports a negative net revenue when refunds exceed commission", async () => {
    vi.mocked(Order.aggregate).mockReturnValue(rows([{ value: 0, count: 0 }]));
    vi.mocked(Payment.aggregate)
      .mockReturnValueOnce(rows([{ value: 1000, commission: 100, count: 1 }]))
      .mockReturnValueOnce(rows([{ value: 5000, commission: 500, count: 1 }]))
      .mockReturnValue(rows([{ value: 0, commission: 0, count: 0 }]));
    vi.mocked(Escrow.aggregate).mockReturnValue(rows([{ value: 0 }]));

    const range = resolveDashboardRange({ range: "7d" }, NOW);
    const overview = await getFinancialOverview(range);

    expect(overview.totals.netRevenue).toBe(0);
    expect(overview.totals.refundVolume).toBe(5000);
  });
});
