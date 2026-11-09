import { describe, expect, it } from "vitest";
import {
  deriveFulfillmentStatus,
  deriveMasterOrderStatus,
  deriveMasterPaymentStatus,
  nextOrderStatusFromShipment,
} from "@/services/orders/status";

describe("fulfilment status derivation", () => {
  it("keeps order, payment and shipment states independent", () => {
    expect(deriveFulfillmentStatus("confirmed", [])).toBe("unfulfilled");
    expect(deriveFulfillmentStatus("processing", [])).toBe("processing");
    expect(deriveFulfillmentStatus("shipped", ["in_transit"])).toBe("shipped");
    expect(deriveFulfillmentStatus("delivered", ["delivered"])).toBe(
      "delivered",
    );
  });

  it("surfaces a failed shipment even when the order is still open", () => {
    expect(deriveFulfillmentStatus("processing", ["failed"])).toBe("failed");
  });

  it("treats cancelled and refunded orders as cancelled fulfilment", () => {
    expect(deriveFulfillmentStatus("cancelled", [])).toBe("cancelled");
    expect(deriveFulfillmentStatus("refunded", [])).toBe("cancelled");
  });

  it("does not mark a partial delivery as delivered", () => {
    expect(deriveFulfillmentStatus("shipped", ["delivered", "in_transit"])).toBe(
      "delivered",
    );
  });
});

describe("master order summaries", () => {
  it("only marks the master delivered when every sub-order is delivered", () => {
    expect(deriveMasterOrderStatus(["delivered", "delivered"])).toBe(
      "delivered",
    );
    expect(deriveMasterOrderStatus(["delivered", "shipped"])).toBe("shipped");
    expect(deriveMasterOrderStatus(["processing", "confirmed"])).toBe(
      "processing",
    );
    expect(deriveMasterOrderStatus([])).toBe("pending");
  });

  it("requires every sub-order payment before the master is paid", () => {
    expect(deriveMasterPaymentStatus(["paid", "paid"])).toBe("paid");
    expect(deriveMasterPaymentStatus(["paid", "pending"])).toBe("pending");
    expect(deriveMasterPaymentStatus(["paid", "failed"])).toBe("failed");
    expect(deriveMasterPaymentStatus(["paid", "refunded"])).toBe("refunded");
  });
});

describe("shipment-driven order transitions", () => {
  it("moves an open order to shipped when the courier starts moving", () => {
    expect(nextOrderStatusFromShipment("confirmed", "picked_up")).toBe(
      "shipped",
    );
    expect(nextOrderStatusFromShipment("processing", "in_transit")).toBe(
      "shipped",
    );
  });

  it("completes a delivery", () => {
    expect(nextOrderStatusFromShipment("shipped", "delivered")).toBe(
      "delivered",
    );
  });

  it("never auto-cancels an order for a failed or cancelled shipment", () => {
    expect(nextOrderStatusFromShipment("processing", "failed")).toBeNull();
    expect(nextOrderStatusFromShipment("processing", "cancelled")).toBeNull();
  });

  it("leaves terminal orders untouched", () => {
    expect(nextOrderStatusFromShipment("cancelled", "delivered")).toBeNull();
    expect(nextOrderStatusFromShipment("refunded", "in_transit")).toBeNull();
  });
});
