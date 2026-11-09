import { describe, expect, it } from "vitest";
import {
  attachShipmentsToOrders,
  groupSummary,
  orderGroupFilter,
  orderGroupKey,
} from "@/services/orders/query";

const order = (overrides: Record<string, unknown> = {}) => ({
  _id: "order-1",
  orderNumber: "RQ-100001",
  masterOrderNumber: "RQ-M-100001",
  subOrderNumber: "RQ-M-100001-A",
  status: "processing",
  paymentStatus: "paid",
  subtotal: 10000,
  shippingFee: 1500,
  discount: 500,
  total: 11000,
  createdAt: new Date("2026-01-01T09:00:00.000Z"),
  customer: { name: "Ada Customer" },
  shippingAddress: { city: "Lagos" },
  ...overrides,
});

describe("master order grouping", () => {
  it("groups explicit master orders and falls back for legacy orders", () => {
    expect(orderGroupKey(order())).toBe("RQ-M-100001");
    expect(
      orderGroupKey(order({ masterOrderNumber: null, orderNumber: "RQ-1" })),
    ).toBe("RQ-1");
  });

  it("matches both the master number and the legacy order number", () => {
    expect(orderGroupFilter("RQ-M-100001")).toEqual({
      $or: [
        { masterOrderNumber: "RQ-M-100001" },
        { orderNumber: "RQ-M-100001" },
      ],
    });
  });

  it("summarises all vendor sub-orders under one master", () => {
    const summary = groupSummary([
      order(),
      order({
        _id: "order-2",
        orderNumber: "RQ-100002",
        subOrderNumber: "RQ-M-100001-B",
        status: "delivered",
        subtotal: 5000,
        shippingFee: 2000,
        discount: 0,
        total: 7000,
      }),
    ] as never);

    expect(summary).toMatchObject({
      masterOrderNumber: "RQ-M-100001",
      orderCount: 2,
      status: "processing",
      paymentStatus: "paid",
      subtotal: 15000,
      shippingFee: 3500,
      discount: 500,
      total: 18000,
    });
    expect(summary.statusCounts).toEqual({ processing: 1, delivered: 1 });
  });
});

describe("shipment attachment", () => {
  it("attaches only each order's own shipment and derives fulfilment", () => {
    const first = {
      ...order(),
      toObject: () => ({ ...order() }),
    };
    const second = {
      ...order({ _id: "order-2", orderNumber: "RQ-100002" }),
      toObject: () => ({ ...order({ _id: "order-2", orderNumber: "RQ-100002" }) }),
    };
    const shipments = [
      { _id: "ship-1", order: "order-1", status: "in_transit" },
      { _id: "ship-2", order: "order-2", status: "delivered" },
    ];

    const result = attachShipmentsToOrders(
      [first, second] as never,
      shipments as never,
    );

    expect(result[0].shipments).toHaveLength(1);
    expect(result[0].fulfillmentStatus).toBe("shipped");
    expect(result[1].shipments).toHaveLength(1);
    expect(result[1].fulfillmentStatus).toBe("delivered");
  });
});
