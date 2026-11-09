import { describe, expect, it } from "vitest";
import {
  buildShipmentEventKey,
  buildWebhookKey,
  mapShipbubbleStatus,
  shipmentStatusRank,
} from "@/services/shipments/status";
import { applyProviderShipment } from "@/services/shipments/sync";
import type { ShipbubbleShipmentPayload } from "@/services/shipments/provider";

const shipment = (overrides: Record<string, unknown> = {}) =>
  ({
    _id: "shipment-1",
    order: "order-1",
    trackingNumber: "SHB-1",
    provider: "shipbubble",
    providerOrderId: "SB-1",
    providerStatus: null,
    status: "confirmed",
    failureReason: null,
    estimatedDeliveryAt: null,
    deliveredAt: null,
    cancelledAt: null,
    cancelReason: null,
    lastEventAt: null,
    trackingUrl: null,
    courier: null,
    events: [],
    providerResponse: null,
    providerError: null,
    lastSyncedAt: null,
    lastSyncAttemptAt: null,
    syncAttempts: 0,
    lastWebhookAt: null,
    ...overrides,
  }) as never;

const payload = (
  overrides: Partial<ShipbubbleShipmentPayload> = {},
): ShipbubbleShipmentPayload => ({
  order_id: "SB-1",
  status: "in_transit",
  date: "2026-01-03 08:00:00",
  courier: {
    name: "GIG Logistics",
    tracking_code: "TRK-1",
    tracking_message: "On the way",
  },
  package_status: [
    { status: "confirmed", datetime: "2026-01-02 09:00:00" },
    { status: "picked_up", datetime: "2026-01-02 12:00:00" },
    { status: "in_transit", datetime: "2026-01-03 08:00:00" },
  ],
  events: [
    {
      location: "Lagos",
      message: "Departed the hub",
      captured: "2026-01-03 07:00:00",
    },
  ],
  ...overrides,
});

describe("Shipbubble status mapping", () => {
  it("maps documented provider states onto internal shipment states", () => {
    expect(mapShipbubbleStatus("pending")).toBe("pending");
    expect(mapShipbubbleStatus("confirmed")).toBe("confirmed");
    expect(mapShipbubbleStatus("picked up")).toBe("picked_up");
    expect(mapShipbubbleStatus("in-transit")).toBe("in_transit");
    expect(mapShipbubbleStatus("completed")).toBe("delivered");
    expect(mapShipbubbleStatus("cancelled")).toBe("cancelled");
    expect(mapShipbubbleStatus("delivery_failed")).toBe("failed");
  });

  it("returns null instead of inventing a state for unknown values", () => {
    expect(mapShipbubbleStatus("awaiting_dispatch_on_a_moon")).toBeNull();
    expect(mapShipbubbleStatus(null)).toBeNull();
  });

  it("orders progressions deterministically", () => {
    expect(shipmentStatusRank("pending")).toBeLessThan(
      shipmentStatusRank("confirmed"),
    );
    expect(shipmentStatusRank("in_transit")).toBeLessThan(
      shipmentStatusRank("delivered"),
    );
    expect(shipmentStatusRank("failed")).toBe(0);
  });
});

describe("provider payload application", () => {
  it("updates the internal status, courier and tracking history", () => {
    const target = shipment();
    const result = applyProviderShipment(target, payload(), {
      now: new Date("2026-01-03T09:00:00.000Z"),
    });

    expect(result.statusChanged).toBe(true);
    expect(result.toStatus).toBe("in_transit");
    expect(result.eventsAdded).toBe(5);
    expect((target as unknown as { status: string }).status).toBe(
      "in_transit",
    );
  });

  it("is idempotent for a repeated provider payload", () => {
    const target = shipment();
    const now = new Date("2026-01-03T09:00:00.000Z");

    applyProviderShipment(target, payload(), { now });
    const second = applyProviderShipment(target, payload(), { now });

    expect(second.eventsAdded).toBe(0);
    expect(resultEventCount(target)).toBe(5);
  });

  it("records a failed delivery with the provider reason", () => {
    const target = shipment();

    const result = applyProviderShipment(
      target,
      payload({
        status: "delivery_failed",
        reason: "Customer was unavailable",
        date: "2026-01-04 10:00:00",
        package_status: [],
        events: [],
      }),
      { now: new Date("2026-01-04T10:05:00.000Z") },
    );

    expect(result.toStatus).toBe("failed");
    expect((target as unknown as { failureReason: string }).failureReason).toBe(
      "Customer was unavailable",
    );
  });

  it("keeps an unrecognised provider status visible without changing the internal state", () => {
    const target = shipment({ status: "confirmed" });

    const result = applyProviderShipment(
      target,
      payload({ status: "teleported", package_status: [], events: [] }),
      { now: new Date("2026-01-04T10:05:00.000Z") },
    );

    expect(result.mappedStatus).toBeNull();
    expect(result.toStatus).toBe("confirmed");
    expect((target as unknown as { providerStatus: string }).providerStatus).toBe(
      "teleported",
    );
  });
});

describe("event and webhook keys", () => {
  it("produces a stable event key for the same event", () => {
    const input = {
      providerOrderId: "SB-1",
      trackingNumber: "SHB-1",
      status: "in_transit",
      message: "In transit",
      location: "Lagos",
      occurredAt: new Date("2026-01-03T08:00:00.000Z"),
    };

    expect(buildShipmentEventKey(input)).toBe(buildShipmentEventKey(input));
  });

  it("produces the same webhook key for equivalent payloads", () => {
    const one = { order_id: "SB-1", status: "in_transit", date: "2026-01-03" };
    const two = { date: "2026-01-03", status: "in_transit", order_id: "SB-1" };

    expect(
      buildWebhookKey("shipment.status.updated", "SB-1", "{}", one),
    ).toBe(buildWebhookKey("shipment.status.updated", "SB-1", "{}", two));
  });

  it("changes the webhook key when the status changes", () => {
    expect(
      buildWebhookKey("shipment.status.updated", "SB-1", "{}", {
        status: "in_transit",
      }),
    ).not.toBe(
      buildWebhookKey("shipment.status.updated", "SB-1", "{}", {
        status: "completed",
      }),
    );
  });
});

function resultEventCount(target: unknown) {
  return (
    (target as { events?: Array<{ key: string }> }).events ?? []
  ).length;
}
