import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/models/order.model", () => ({
  default: {
    aggregate: vi.fn(),
    findOne: vi.fn(),
    find: vi.fn(),
  },
}));
vi.mock("@/models/payment.model", () => ({
  default: { find: vi.fn() },
}));
vi.mock("@/models/shipment.model", () => ({
  default: { find: vi.fn() },
}));
vi.mock("@/models/store.model", () => ({
  default: { find: vi.fn() },
}));
vi.mock("@/services/orders/query", () => ({
  groupSummary: vi.fn(() => ({
    itemCount: 2,
    orderCount: 2,
    subtotal: 71500,
    deliveryFee: 3000,
    discount: 0,
    total: 74500,
  })),
  loadOrderGroupContext: vi.fn(async () => ({ orders: [] })),
  orderGroupKey: vi.fn(
    (order: { masterOrderNumber?: string | null; orderNumber: string }) =>
      order.masterOrderNumber ?? order.orderNumber,
  ),
  orderTimelineForContext: vi.fn(() => []),
}));

import Order from "@/models/order.model";
import Payment from "@/models/payment.model";
import Shipment from "@/models/shipment.model";
import Store from "@/models/store.model";
import {
  getCustomerOrderGroup,
  queryCustomerOrders,
} from "@/services/orders/customer";

const storeDoc = {
  _id: "s1",
  name: "TechHub Lagos",
  slug: "techhub-lagos",
  logo: null,
  category: "fashion-apparel",
  toObject() {
    return { ...this };
  },
};

const leanChain = (rows: unknown[]) => ({
  sort: () => ({ lean: async () => rows }),
});

const aggregateRow = (overrides: Record<string, unknown> = {}) => ({
  _id: "RQ-M-1",
  orderCount: 2,
  itemCount: 2,
  total: 74500,
  subtotal: 71500,
  deliveryFee: 3000,
  placedAt: new Date("2026-11-14T09:00:00.000Z"),
  statuses: ["confirmed", "pending"],
  paymentStatuses: ["paid"],
  orders: [
    {
      _id: "o1",
      orderNumber: "RQ-1",
      store: "s1",
      status: "confirmed",
      paymentStatus: "paid",
      total: 55000,
      subtotal: 53500,
      shippingFee: 1500,
      placedAt: new Date("2026-11-14T09:00:00.000Z"),
      expectedDeliveryAt: new Date("2026-11-17T09:00:00.000Z"),
      itemCount: 1,
    },
    {
      _id: "o2",
      orderNumber: "RQ-2",
      store: "s1",
      status: "pending",
      paymentStatus: "paid",
      total: 19500,
      subtotal: 18000,
      shippingFee: 1500,
      placedAt: new Date("2026-11-14T09:00:00.000Z"),
      expectedDeliveryAt: new Date("2026-11-18T09:00:00.000Z"),
      itemCount: 1,
    },
  ],
  ...overrides,
});

describe("queryCustomerOrders", () => {
  const customerId = "64b000000000000000000001";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Order.aggregate).mockResolvedValue([
      { rows: [aggregateRow()], total: [{ count: 1 }] },
    ] as never);
    vi.mocked(Store.find).mockReturnValue({
      select: async () => [storeDoc],
    } as never);
  });

  it("groups the customer's sub-orders by master order", async () => {
    const result = await queryCustomerOrders(customerId, { page: 1, limit: 10 });

    expect(result.pagination).toEqual({
      page: 1,
      limit: 10,
      total: 1,
      pages: 1,
    });
    expect(result.orders).toHaveLength(1);

    const [group] = result.orders;
    expect(group).toMatchObject({
      masterOrderNumber: "RQ-M-1",
      orderCount: 2,
      itemCount: 2,
      subtotal: 71500,
      deliveryFee: 3000,
      discount: 0,
      total: 74500,
      isPendingPayment: false,
    });
    expect(group.orders.map((order) => order.orderNumber)).toEqual([
      "RQ-1",
      "RQ-2",
    ]);
    expect(group.orders[0].store).toEqual({
      _id: "s1",
      name: "TechHub Lagos",
      slug: "techhub-lagos",
      logo: null,
      category: "fashion-apparel",
    });
    expect(group.expectedDeliveryAt).toEqual(
      new Date("2026-11-17T09:00:00.000Z"),
    );

    const pipeline = vi.mocked(Order.aggregate).mock.calls[0][0] as unknown[];
    expect(JSON.stringify(pipeline)).toContain("masterOrderNumber");
    expect(
      (pipeline[0] as { $match: { customer: { toString: () => string } } })
        .$match.customer.toString(),
    ).toBe(customerId);
  });

  it("flags a group whose payment is still pending", async () => {
    vi.mocked(Order.aggregate).mockResolvedValue([
      {
        rows: [aggregateRow({ paymentStatuses: ["pending"] })],
        total: [{ count: 1 }],
      },
    ] as never);

    const result = await queryCustomerOrders(customerId, { page: 1, limit: 10 });

    expect(result.orders[0].isPendingPayment).toBe(true);
  });

  it("filters the pipeline by order status when requested", async () => {
    await queryCustomerOrders(customerId, { page: 2, limit: 5, status: "processing" });

    const pipeline = vi.mocked(Order.aggregate).mock.calls[0][0] as Array<
      Record<string, unknown>
    >;

    expect(pipeline).toContainEqual({ $match: { status: "processing" } });
    expect(pipeline.at(-1)).toMatchObject({
      $facet: {
        rows: [{ $skip: 5 }, { $limit: 5 }],
      },
    });
  });

  it("returns an empty page when the customer has no orders", async () => {
    vi.mocked(Order.aggregate).mockResolvedValue([
      { rows: [], total: [] },
    ] as never);

    const result = await queryCustomerOrders(customerId, { page: 1, limit: 10 });

    expect(result.orders).toEqual([]);
    expect(result.pagination.total).toBe(0);
  });
});

describe("getCustomerOrderGroup", () => {
  const orderDoc = {
    _id: "o1",
    orderNumber: "RQ-1",
    subOrderNumber: "RQ-M-1-A",
    masterOrderNumber: "RQ-M-1",
    store: "s1",
    items: [
      { product: "p1", name: "4K Streaming Stick", quantity: 1, unitPrice: 53500, total: 53500 },
    ],
    subtotal: 53500,
    shippingFee: 1500,
    discount: 0,
    total: 55000,
    status: "confirmed",
    paymentStatus: "paid",
    shippingAddress: {
      recipientName: "Ada Checkout",
      street: "4 Freedom Way",
      city: "Lekki",
      state: "Lagos",
    },
    timeline: [
      {
        type: "payment_confirmed",
        occurredAt: new Date("2026-11-14T10:00:00.000Z"),
        description: "Payment confirmed.",
        source: "system",
      },
    ],
    placedAt: new Date("2026-11-14T09:00:00.000Z"),
    expectedDeliveryAt: new Date("2026-11-17T09:00:00.000Z"),
    createdAt: new Date("2026-11-14T09:00:00.000Z"),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Order.findOne).mockResolvedValue(orderDoc as never);
    vi.mocked(Order.find).mockReturnValue(leanChain([orderDoc]) as never);
    vi.mocked(Payment.find).mockReturnValue(
      leanChain([
        {
          _id: "pay1",
          reference: "PAY-1",
          amount: 55000,
          status: "successful",
          channel: "card",
          provider: "paystack",
          paidAt: new Date("2026-11-14T10:00:00.000Z"),
          createdAt: new Date("2026-11-14T09:00:00.000Z"),
        },
      ]) as never,
    );
    vi.mocked(Shipment.find).mockReturnValue(
      leanChain([
        {
          _id: "ship1",
          trackingNumber: "TRACK-1",
          provider: "shipbubble",
          status: "in_transit",
          events: [
            {
              status: "in_transit",
              message: "Left the hub",
              location: "Lagos",
              occurredAt: new Date("2026-11-15T09:00:00.000Z"),
            },
          ],
        },
      ]) as never,
    );
    vi.mocked(Store.find).mockReturnValue({
      select: () => ({ lean: async () => [storeDoc] }),
    } as never);
  });

  it("returns the master group with stores, payments and shipments", async () => {
    const result = await getCustomerOrderGroup("c1", "RQ-M-1");

    expect(result.masterOrderNumber).toBe("RQ-M-1");
    expect(result.orders).toHaveLength(1);
    expect(result.orders[0]).toMatchObject({
      orderNumber: "RQ-1",
      subOrderNumber: "RQ-M-1-A",
      store: {
        _id: "s1",
        name: "TechHub Lagos",
      },
      items: [
        expect.objectContaining({ name: "4K Streaming Stick", quantity: 1 }),
      ],
      paymentStatus: "paid",
      status: "confirmed",
    });
    expect(result.payments).toEqual([
      {
        _id: "pay1",
        reference: "PAY-1",
        amount: 55000,
        currency: "NGN",
        status: "successful",
        channel: "card",
        provider: "paystack",
        paidAt: new Date("2026-11-14T10:00:00.000Z"),
        failureReason: null,
        createdAt: new Date("2026-11-14T09:00:00.000Z"),
      },
    ]);
    expect(result.shipments[0]).toMatchObject({
      trackingNumber: "TRACK-1",
      provider: "shipbubble",
      status: "in_transit",
      events: [
        expect.objectContaining({ message: "Left the hub", location: "Lagos" }),
      ],
    });
    expect(result.summary).toMatchObject({ total: 74500 });
  });

  it("does not leak customer or escrow internals", async () => {
    const result = await getCustomerOrderGroup("c1", "RQ-M-1");
    const serialised = JSON.stringify(result);

    expect(serialised).not.toContain("customer");
    expect(serialised).not.toContain("escrow");
    expect(serialised).not.toContain("vendor");
  });

  it("hides another customer's order behind a 404", async () => {
    vi.mocked(Order.findOne).mockResolvedValue(null);

    await expect(getCustomerOrderGroup("c2", "RQ-M-1")).rejects.toMatchObject({
      statusCode: 404,
      message: "Order not found",
    });

    expect(Order.findOne).toHaveBeenCalledWith({
      customer: "c2",
      $or: [{ masterOrderNumber: "RQ-M-1" }, { orderNumber: "RQ-M-1" }],
    });
    expect(Order.find).not.toHaveBeenCalled();
  });
});

