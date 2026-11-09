import { describe, expect, it } from "vitest";
import { buildOrderTimeline, paginateTimeline } from "@/services/orders/timeline";

const baseOrder = (overrides: Record<string, unknown> = {}) => ({
  id: "order-1",
  orderNumber: "RQ-100001",
  subOrderNumber: "RQ-M-100001-A",
  masterOrderNumber: "RQ-M-100001",
  status: "pending",
  paymentStatus: "pending",
  createdAt: "2026-01-01T09:00:00.000Z",
  placedAt: "2026-01-01T09:00:00.000Z",
  updatedAt: "2026-01-01T09:00:00.000Z",
  deliveredAt: null,
  cancelledAt: null,
  timeline: [],
  ...overrides,
});

const eventTypes = (events: ReturnType<typeof buildOrderTimeline>) =>
  events.map((event) => event.type);

describe("order timeline", () => {
  it("includes created and payment events only when the evidence exists", () => {
    const timeline = buildOrderTimeline({
      orders: [baseOrder()],
      payments: [
        {
          orderId: "order-1",
          status: "successful",
          reference: "PAY-1",
          paidAt: "2026-01-01T09:05:00.000Z",
          createdAt: "2026-01-01T09:02:00.000Z",
        },
      ],
    });

    expect(eventTypes(timeline)).toEqual(["created", "payment_confirmed"]);
    expect(timeline[1].reference).toBe("PAY-1");
  });

  it("does not infer processing or vendor notification without a recorded event", () => {
    const timeline = buildOrderTimeline({
      orders: [baseOrder({ status: "processing" })],
    });

    expect(eventTypes(timeline)).toEqual(["created"]);
  });

  it("records explicit events in chronological order", () => {
    const timeline = buildOrderTimeline({
      orders: [
        baseOrder({
          status: "delivered",
          deliveredAt: "2026-01-05T12:00:00.000Z",
          timeline: [
            {
              type: "vendor_notified",
              occurredAt: "2026-01-01T09:15:00.000Z",
              description: "Vendor notified.",
            },
            {
              type: "processing",
              occurredAt: "2026-01-01T11:00:00.000Z",
              description: "Vendor started preparing the order.",
            },
          ],
        }),
      ],
    });

    expect(eventTypes(timeline)).toEqual([
      "created",
      "vendor_notified",
      "processing",
      "completed",
    ]);
  });

  it("derives shipment milestones from real shipment events", () => {
    const timeline = buildOrderTimeline({
      orders: [baseOrder({ status: "shipped" })],
      shipments: [
        {
          id: "shipment-1",
          orderId: "order-1",
          trackingNumber: "SHB-1",
          status: "in_transit",
          createdAt: "2026-01-02T08:00:00.000Z",
          deliveredAt: null,
          lastEventAt: "2026-01-03T08:00:00.000Z",
          events: [
            {
              status: "picked_up",
              message: "Picked up",
              occurredAt: "2026-01-02T10:00:00.000Z",
            },
            {
              status: "in_transit",
              message: "In transit",
              occurredAt: "2026-01-03T08:00:00.000Z",
            },
          ],
        },
      ],
    });

    expect(eventTypes(timeline)).toEqual([
      "created",
      "shipment_created",
      "picked_up",
      "in_transit",
    ]);
  });

  it("never invents a delivery for an undelivered shipment", () => {
    const timeline = buildOrderTimeline({
      orders: [baseOrder({ status: "shipped" })],
      shipments: [
        {
          id: "shipment-1",
          orderId: "order-1",
          trackingNumber: "SHB-1",
          status: "in_transit",
          createdAt: "2026-01-02T08:00:00.000Z",
          events: [],
        },
      ],
    });

    expect(eventTypes(timeline)).not.toContain("delivered");
  });

  it("deduplicates an explicit event against the derived fallback", () => {
    const timeline = buildOrderTimeline({
      orders: [
        baseOrder({
          status: "cancelled",
          cancelledAt: "2026-01-02T09:00:00.000Z",
          timeline: [
            {
              type: "cancelled",
              occurredAt: "2026-01-02T09:00:00.000Z",
              description: "Customer cancelled the order.",
            },
          ],
        }),
      ],
    });

    expect(eventTypes(timeline).filter((type) => type === "cancelled")).toHaveLength(
      1,
    );
  });

  it("paginates without changing the event order", () => {
    const events = buildOrderTimeline({
      orders: [
        baseOrder({
          timeline: [
            { type: "vendor_notified", occurredAt: "2026-01-01T09:15:00.000Z" },
            { type: "processing", occurredAt: "2026-01-01T11:00:00.000Z" },
          ],
        }),
      ],
    });

    const first = paginateTimeline(events, 1, 2);
    const second = paginateTimeline(events, 2, 2);

    expect(first.events).toHaveLength(2);
    expect(first.pagination).toEqual({ page: 1, limit: 2, total: 3, pages: 2 });
    expect(second.events[0].type).toBe("processing");
  });
});
