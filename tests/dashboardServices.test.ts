import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/models/user.model", () => ({
  default: { aggregate: vi.fn() },
}));
vi.mock("@/models/store.model", () => ({
  default: { aggregate: vi.fn() },
}));
vi.mock("@/models/product.model", () => ({
  default: { aggregate: vi.fn() },
}));
vi.mock("@/models/order.model", () => ({
  default: { aggregate: vi.fn(), countDocuments: vi.fn() },
  GMV_ORDER_STATUSES: ["pending", "confirmed", "delivered"],
}));
vi.mock("@/models/payment.model", () => ({
  default: { aggregate: vi.fn() },
}));
vi.mock("@/models/escrow.model", () => ({
  default: { aggregate: vi.fn() },
}));
vi.mock("@/models/dispute.model", () => ({
  default: { aggregate: vi.fn(), countDocuments: vi.fn() },
  UNRESOLVED_DISPUTE_STATUSES: ["open", "investigating"],
}));
vi.mock("@/models/shipment.model", () => ({
  default: { aggregate: vi.fn() },
}));
vi.mock("@/models/activityEvent.model", () => ({
  default: { find: vi.fn() },
}));

import User from "@/models/user.model";
import Store from "@/models/store.model";
import Product from "@/models/product.model";
import Order from "@/models/order.model";
import Payment from "@/models/payment.model";
import Escrow from "@/models/escrow.model";
import Dispute from "@/models/dispute.model";
import Shipment from "@/models/shipment.model";
import ActivityEvent from "@/models/activityEvent.model";
import { getDashboardMetrics } from "@/services/dashboard/metrics";
import { getDashboardCharts } from "@/services/dashboard/charts";
import { getPendingActions } from "@/services/dashboard/pendingActions";
import { getRecentActivity } from "@/services/dashboard/recentActivity";
import { resolveDashboardRange } from "@/services/dashboard/range";

const NOW = new Date("2026-11-04T12:00:00.000Z");

const rows = (value: unknown) => value as never;

describe("dashboard metrics", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns all twelve metrics with range comparisons", async () => {
    vi.mocked(User.aggregate).mockReturnValueOnce(
      rows([{ customers: [{ value: 36 }], vendors: [{ value: 14 }] }]),
    );
    vi.mocked(Store.aggregate)
      .mockReturnValueOnce(rows([{ value: 12 }]))
      .mockReturnValueOnce(
        rows([{ total: [{ value: 14 }], pending: [{ value: 2 }] }]),
      );
    vi.mocked(Product.aggregate).mockReturnValueOnce(
      rows([{ total: [{ value: 50 }], pending: [{ value: 4 }] }]),
    );
    vi.mocked(Order.countDocuments).mockReturnValueOnce(rows(190));
    vi.mocked(Order.aggregate).mockReturnValueOnce(
      rows([{ current: [{ value: 1000 }], previous: [{ value: 800 }] }]),
    );
    vi.mocked(Payment.aggregate).mockReturnValueOnce(
      rows([{ current: [{ value: 75 }], previous: [{ value: 50 }] }]),
    );
    vi.mocked(Escrow.aggregate).mockReturnValueOnce(rows([{ value: 500 }]));
    vi.mocked(Dispute.countDocuments).mockReturnValueOnce(rows(3));

    const range = resolveDashboardRange({ range: "7d" }, NOW);
    const metrics = await getDashboardMetrics(range);
    const byKey = Object.fromEntries(metrics.map((item) => [item.key, item]));

    expect(metrics).toHaveLength(12);
    expect(byKey.totalUsers.value).toBe(36);
    expect(byKey.totalVendors.value).toBe(14);
    expect(byKey.activeVendors.value).toBe(12);
    expect(byKey.totalStores.value).toBe(14);
    expect(byKey.pendingStoreApprovals.value).toBe(2);
    expect(byKey.totalProducts.value).toBe(50);
    expect(byKey.pendingProductApprovals.value).toBe(4);
    expect(byKey.totalOrders.value).toBe(190);
    expect(byKey.grossMerchandiseValue.value).toBe(1000);
    expect(byKey.grossMerchandiseValue.changePct).toBe(25);
    expect(byKey.grossMerchandiseValue.format).toBe("currency");
    expect(byKey.marketplaceRevenue.value).toBe(75);
    expect(byKey.marketplaceRevenue.changePct).toBe(50);
    expect(byKey.escrowBalance.value).toBe(500);
    expect(byKey.unresolvedDisputes.value).toBe(3);
  });

  it("uses one aggregation per collection instead of per-record reads", async () => {
    vi.mocked(User.aggregate).mockReturnValueOnce(
      rows([{ customers: [], vendors: [] }]),
    );
    vi.mocked(Store.aggregate)
      .mockReturnValueOnce(rows([]))
      .mockReturnValueOnce(rows([]));
    vi.mocked(Product.aggregate).mockReturnValueOnce(rows([]));
    vi.mocked(Order.countDocuments).mockReturnValueOnce(rows(0));
    vi.mocked(Order.aggregate).mockReturnValueOnce(rows([]));
    vi.mocked(Payment.aggregate).mockReturnValueOnce(rows([]));
    vi.mocked(Escrow.aggregate).mockReturnValueOnce(rows([]));
    vi.mocked(Dispute.countDocuments).mockReturnValueOnce(rows(0));

    const metrics = await getDashboardMetrics(
      resolveDashboardRange({ range: "today" }, NOW),
    );

    expect(metrics.every((item) => item.value === 0)).toBe(true);
    expect(User.aggregate).toHaveBeenCalledTimes(1);
    expect(Store.aggregate).toHaveBeenCalledTimes(2);
    expect(Order.aggregate).toHaveBeenCalledTimes(1);
    expect(Payment.aggregate).toHaveBeenCalledTimes(1);
  });
});

describe("dashboard charts", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("zero-fills every bucket and totals each series", async () => {
    vi.mocked(Order.aggregate).mockReturnValueOnce(
      rows([
        {
          orders: [{ _id: "2026-11-04", value: 2 }],
          sales: [{ _id: "2026-11-04", value: 5000 }],
        },
      ]),
    );
    vi.mocked(Payment.aggregate).mockReturnValueOnce(
      rows([{ _id: "2026-11-03", value: 300 }]),
    );
    vi.mocked(User.aggregate).mockReturnValueOnce(
      rows([{ _id: "2026-11-01", value: 1 }]),
    );
    vi.mocked(Store.aggregate).mockReturnValueOnce(
      rows([{ _id: "2026-11-02", value: 1 }]),
    );

    const range = resolveDashboardRange({ range: "7d" }, NOW);
    const series = await getDashboardCharts(range);
    const byKey = Object.fromEntries(series.map((item) => [item.key, item]));

    expect(series.map((item) => item.key)).toEqual([
      "orders",
      "salesVolume",
      "marketplaceRevenue",
      "vendorRegistrations",
      "storeApprovals",
    ]);
    expect(series.every((item) => item.points.length === 7)).toBe(true);

    const orderPoints = byKey.orders.points;
    expect(orderPoints.find((point) => point.key === "2026-11-04")?.value).toBe(
      2,
    );
    expect(orderPoints.find((point) => point.key === "2026-11-03")?.value).toBe(
      0,
    );

    expect(byKey.orders.total).toBe(2);
    expect(byKey.salesVolume.total).toBe(5000);
    expect(byKey.marketplaceRevenue.total).toBe(300);
    expect(byKey.vendorRegistrations.total).toBe(1);
    expect(byKey.storeApprovals.total).toBe(1);
  });

  it("returns an all-zero series when the window has no records", async () => {
    vi.mocked(Order.aggregate).mockReturnValueOnce(rows([]));
    vi.mocked(Payment.aggregate).mockReturnValueOnce(rows([]));
    vi.mocked(User.aggregate).mockReturnValueOnce(rows([]));
    vi.mocked(Store.aggregate).mockReturnValueOnce(rows([]));

    const series = await getDashboardCharts(
      resolveDashboardRange({ range: "30d" }, NOW),
    );

    expect(series.every((item) => item.total === 0)).toBe(true);
    expect(series.every((item) => item.points.length === 30)).toBe(true);
  });
});

describe("dashboard pending actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("reports every queue, including empty ones", async () => {
    const oldest = new Date("2026-10-01T08:00:00.000Z");
    vi.mocked(Store.aggregate).mockReturnValueOnce(
      rows([{ count: 2, oldest }]),
    );
    vi.mocked(Product.aggregate).mockReturnValueOnce(
      rows([{ count: 4, oldest }]),
    );
    vi.mocked(Order.aggregate).mockReturnValueOnce(
      rows([{ count: 1, oldest }]),
    );
    vi.mocked(Shipment.aggregate).mockReturnValueOnce(
      rows([{ count: 3, oldest }]),
    );
    vi.mocked(Dispute.aggregate).mockReturnValueOnce(rows([{ count: 2, oldest }]));
    vi.mocked(Payment.aggregate).mockReturnValueOnce(rows([]));

    const items = await getPendingActions(NOW);
    const byKey = Object.fromEntries(items.map((item) => [item.key, item]));

    expect(items).toHaveLength(6);
    expect(byKey.store_approvals.count).toBe(2);
    expect(byKey.product_moderation.count).toBe(4);
    expect(byKey.delayed_orders.count).toBe(1);
    expect(byKey.failed_shipments.count).toBe(3);
    expect(byKey.unresolved_disputes.count).toBe(2);
    expect(byKey.payment_issues.count).toBe(0);
    expect(byKey.payment_issues.oldestAt).toBeNull();
    expect(byKey.store_approvals.href).toBe("/stores?status=pending");
    expect(byKey.product_moderation.href).toBe("/products?status=pending");
    expect(byKey.unresolved_disputes.oldestAt).toBe(oldest.toISOString());
  });

  it("never returns undefined for an empty database", async () => {
    vi.mocked(Store.aggregate).mockReturnValueOnce(rows([]));
    vi.mocked(Product.aggregate).mockReturnValueOnce(rows([]));
    vi.mocked(Order.aggregate).mockReturnValueOnce(rows([]));
    vi.mocked(Shipment.aggregate).mockReturnValueOnce(rows([]));
    vi.mocked(Dispute.aggregate).mockReturnValueOnce(rows([]));
    vi.mocked(Payment.aggregate).mockReturnValueOnce(rows([]));

    const items = await getPendingActions(NOW);

    expect(items.every((item) => item.count === 0)).toBe(true);
    expect(items.every((item) => item.oldestAt === null)).toBe(true);
  });
});

describe("dashboard recent activity", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const chain = (value: unknown) => ({
    sort: vi.fn().mockReturnValue({
      limit: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(value),
      }),
    }),
  });

  it("maps stored events and fills optional fields", async () => {
    vi.mocked(ActivityEvent.find).mockReturnValueOnce(
      chain([
        {
          _id: "evt-1",
          type: "store_approved",
          channel: "marketplace",
          title: "Store approved",
          description: "Amaka Fabrics was approved.",
          actorName: "Ada Admin",
          actorRole: "SUPER_ADMIN",
          subjectType: "store",
          subjectLabel: "Amaka Fabrics",
          href: "/vendors?search=Amaka",
          createdAt: new Date("2026-11-04T10:00:00.000Z"),
        },
        {
          _id: "evt-2",
          type: "order_created",
          channel: "marketplace",
          title: "New order placed",
          createdAt: "2026-11-04T09:00:00.000Z",
        },
      ]) as never,
    );

    const items = await getRecentActivity({ limit: 10 });

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      id: "evt-1",
      title: "Store approved",
      actorName: "Ada Admin",
      href: "/vendors?search=Amaka",
      createdAt: "2026-11-04T10:00:00.000Z",
    });
    expect(items[1]).toMatchObject({
      description: null,
      actorName: "System",
      actorRole: "system",
      subjectType: "platform",
      subjectLabel: null,
      href: null,
    });
  });

  it("scopes the query to the selected range when one is given", async () => {
    const find = vi.mocked(ActivityEvent.find);
    find.mockReturnValueOnce(chain([]) as never);

    const range = resolveDashboardRange({ range: "7d" }, NOW);
    await getRecentActivity({ limit: 5, range });

    expect(find).toHaveBeenCalledWith({
      createdAt: { $gte: range.start, $lt: range.end },
    });
  });

  it("reads the latest events without a range by default", async () => {
    const find = vi.mocked(ActivityEvent.find);
    find.mockReturnValueOnce(chain([]) as never);

    await getRecentActivity();

    expect(find).toHaveBeenCalledWith({});
  });
});
