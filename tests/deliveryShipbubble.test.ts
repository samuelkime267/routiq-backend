import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/config/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/config/env")>()),
  DELIVERY_PLATFORM_FALLBACK: false,
}));

vi.mock("@/services/shipments/provider", () => ({
  isShipbubbleConfigured: true,
  validateShipbubbleAddress: vi.fn(),
  fetchShipbubbleRates: vi.fn(),
}));

import { quoteStoreDelivery } from "@/services/delivery";
import {
  fetchShipbubbleRates,
  validateShipbubbleAddress,
} from "@/services/shipments/provider";

const store = {
  _id: "s1",
  name: "TechHub Lagos",
  email: "store@example.com",
  phoneNumber: "08012345678",
  address: {
    street: "12 Admiralty Way",
    city: "Lekki",
    lga: "Eti-Osa",
    state: "Lagos",
    country: "Nigeria",
  },
};

const address = {
  recipientName: "Ada Checkout",
  phone: "08012345678",
  street: "4 Freedom Way",
  city: "Lekki",
  lga: "Eti-Osa",
  state: "Lagos",
  country: "Nigeria",
};

describe("Shipbubble delivery quoting", () => {
  beforeEach(() => {
    vi.mocked(validateShipbubbleAddress).mockResolvedValue({
      addressCode: "ADDR-1",
      latitude: 6.4,
      longitude: 3.4,
    });
    vi.mocked(fetchShipbubbleRates).mockResolvedValue([
      {
        courierId: "10",
        courierName: "GIG Logistics",
        serviceCode: "standard",
        serviceType: "Standard",
        fee: 1800,
        estimatedDaysMin: 2,
        estimatedDaysMax: 3,
        estimatedDeliveryText: "2-3 business days",
      },
      {
        courierId: "11",
        courierName: "DHL",
        serviceCode: "express",
        serviceType: "Express",
        fee: 2600,
        estimatedDaysMin: 1,
        estimatedDaysMax: 1,
        estimatedDeliveryText: "1 business day",
      },
    ]);
  });

  it("uses live provider rates and defaults to the cheapest", async () => {
    const quote = await quoteStoreDelivery(
      store,
      address,
      [{ name: "4K Streaming Stick", quantity: 1, unitPrice: 53500 }],
      { subtotal: 53500 },
    );

    expect(quote.available).toBe(true);
    expect(quote.options).toHaveLength(2);
    expect(quote.options[0]).toMatchObject({
      id: "shipbubble:10:standard",
      courier: "GIG Logistics",
      fee: 1800,
      provider: "shipbubble",
      currency: "NGN",
    });
    expect(quote.selectedOptionId).toBe("shipbubble:10:standard");
    expect(quote.message).toBeNull();
    expect(validateShipbubbleAddress).toHaveBeenCalledTimes(2);
  });

  it("returns no option instead of inventing a fee when the provider has no rates", async () => {
    vi.mocked(fetchShipbubbleRates).mockResolvedValue([]);

    const quote = await quoteStoreDelivery(store, address, [], {
      subtotal: 53500,
    });

    expect(quote).toEqual({
      available: false,
      options: [],
      selectedOptionId: null,
      message:
        "Shipbubble has no delivery option for this address. Try another address or contact support.",
    });
  });

  it("refuses to quote when the delivery address cannot be verified", async () => {
    vi.mocked(validateShipbubbleAddress)
      .mockResolvedValueOnce({ addressCode: "STORE-1", latitude: null, longitude: null })
      .mockResolvedValueOnce({ addressCode: null, latitude: null, longitude: null });

    const quote = await quoteStoreDelivery(store, address, [], { subtotal: 0 });

    expect(quote.available).toBe(false);
    expect(quote.options).toEqual([]);
    expect(quote.message).toContain("could not verify this delivery address");
    expect(fetchShipbubbleRates).not.toHaveBeenCalled();
  });

  it("does not call the provider when the store has no pickup address", async () => {
    const quote = await quoteStoreDelivery(
      { ...store, address: null },
      address,
      [],
      { subtotal: 0 },
    );

    expect(quote.available).toBe(false);
    expect(quote.message).toContain("pickup address");
    expect(validateShipbubbleAddress).not.toHaveBeenCalled();
  });

  it("fails safely when the provider is unreachable", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.mocked(validateShipbubbleAddress).mockRejectedValue(
      new Error("network down"),
    );

    const quote = await quoteStoreDelivery(store, address, [], { subtotal: 0 });

    expect(quote.available).toBe(false);
    expect(quote.options).toEqual([]);
    expect(quote.message).toContain("could not be calculated with Shipbubble");
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
