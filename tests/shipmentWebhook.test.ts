import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";

const {
  ledgerCreate,
  ledgerDeleteOne,
  shipmentFindOne,
  syncShipmentFromProvider,
} = vi.hoisted(() => ({
  ledgerCreate: vi.fn(),
  ledgerDeleteOne: vi.fn(),
  shipmentFindOne: vi.fn(),
  syncShipmentFromProvider: vi.fn(),
}));

vi.mock("@/services/shipments/provider", () => ({
  isShipbubbleConfigured: true,
  verifyShipbubbleSignature: vi.fn(() => true),
}));
vi.mock("@/services/shipments/sync", () => ({ syncShipmentFromProvider }));
vi.mock("@/models/providerWebhookEvent.model", () => ({
  default: { create: ledgerCreate, deleteOne: ledgerDeleteOne },
}));
vi.mock("@/models/shipment.model", () => ({
  default: { findOne: shipmentFindOne },
}));

import { processShipbubbleWebhook } from "@/services/shipments/webhook";

const rawBody = Buffer.from(
  JSON.stringify({
    event: "shipment.status.updated",
    data: { order_id: "SB-1", status: "in_transit" },
  }),
);

const ledger = () => ({
  _id: "event-1",
  status: "processing",
  error: null,
  shipment: null,
  processedAt: null,
  save: vi.fn(async () => undefined),
});

describe("Shipbubble webhook idempotency", () => {
  beforeEach(() => {
    ledgerCreate.mockReset();
    ledgerDeleteOne.mockReset();
    shipmentFindOne.mockReset();
    syncShipmentFromProvider.mockReset();
  });

  it("acknowledges a duplicate delivery without applying it again", async () => {
    ledgerCreate.mockRejectedValueOnce({ code: 11000 });

    const result = await processShipbubbleWebhook({
      rawBody,
      signature: "sha512=abc",
      payload: JSON.parse(rawBody.toString("utf8")),
    });

    expect(result).toMatchObject({ duplicate: true, status: "duplicate" });
    expect(shipmentFindOne).not.toHaveBeenCalled();
    expect(syncShipmentFromProvider).not.toHaveBeenCalled();
  });

  it("ignores a payload without a provider order id", async () => {
    const record = ledger();
    ledgerCreate.mockResolvedValueOnce(record);

    const result = await processShipbubbleWebhook({
      rawBody,
      signature: "sha512=abc",
      payload: { event: "shipment.status.updated", data: { status: "pending" } },
    });

    expect(result.status).toBe("ignored");
    expect(record.status).toBe("ignored");
    expect(record.save).toHaveBeenCalled();
  });

  it("records an unmatched shipment without failing the provider retry", async () => {
    const record = ledger();
    ledgerCreate.mockResolvedValueOnce(record);
    shipmentFindOne.mockResolvedValueOnce(null);

    const result = await processShipbubbleWebhook({
      rawBody,
      signature: "sha512=abc",
      payload: JSON.parse(rawBody.toString("utf8")),
    });

    expect(result.status).toBe("unmatched");
    expect(record.status).toBe("ignored");
    expect(syncShipmentFromProvider).not.toHaveBeenCalled();
  });

  it("applies a matched event and marks the ledger processed", async () => {
    const record = ledger();
    const shipment = {
      _id: "shipment-1",
      lastWebhookAt: null,
      save: vi.fn(async () => undefined),
    };

    ledgerCreate.mockResolvedValueOnce(record);
    shipmentFindOne.mockResolvedValueOnce(shipment);
    syncShipmentFromProvider.mockResolvedValueOnce({ shipment });

    const result = await processShipbubbleWebhook({
      rawBody,
      signature: "sha512=abc",
      payload: JSON.parse(rawBody.toString("utf8")),
    });

    expect(result).toMatchObject({
      status: "processed",
      processed: true,
      shipmentId: "shipment-1",
    });
    expect(syncShipmentFromProvider).toHaveBeenCalledWith(
      shipment,
      expect.objectContaining({ source: "webhook" }),
    );
    expect(record.status).toBe("processed");
    expect(record.shipment).toBe("shipment-1");
    expect(shipment.save).toHaveBeenCalled();
  });

  it("releases the ledger row when applying the payload fails", async () => {
    const record = ledger();
    ledgerCreate.mockResolvedValueOnce(record);
    shipmentFindOne.mockResolvedValueOnce({ _id: "shipment-1" });
    syncShipmentFromProvider.mockRejectedValueOnce(new Error("provider down"));

    await expect(
      processShipbubbleWebhook({
        rawBody,
        signature: "sha512=abc",
        payload: JSON.parse(rawBody.toString("utf8")),
      }),
    ).rejects.toThrow("provider down");
  });
});

describe("Shipbubble webhook signatures", () => {
  it("accepts a signature generated with the API key", async () => {
    const actual = await vi.importActual<
      typeof import("@/services/shipments/provider")
    >("@/services/shipments/provider");
    const signature = createHmac("sha512", "secret-key")
      .update(rawBody)
      .digest("hex");

    expect(
      actual.verifyShipbubbleSignature(rawBody, signature, "secret-key"),
    ).toBe(true);
  });

  it("rejects a mismatched signature", async () => {
    const actual = await vi.importActual<
      typeof import("@/services/shipments/provider")
    >("@/services/shipments/provider");

    expect(
      actual.verifyShipbubbleSignature(rawBody, "deadbeef", "secret-key"),
    ).toBe(false);
  });
});
