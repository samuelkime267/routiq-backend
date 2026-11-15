import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/config/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/config/env")>()),
  DELIVERY_PLATFORM_FALLBACK: true,
  NODE_ENV: "development",
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
import { DEFAULT_SETTINGS, type PlatformSettingsView } from "@/services/settings";

const settings = (shipping: Partial<PlatformSettingsView["shipping"]> = {}) =>
  ({
    ...DEFAULT_SETTINGS,
    shipping: { ...DEFAULT_SETTINGS.shipping, ...shipping },
  }) as PlatformSettingsView;

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

describe("development-only platform delivery fallback", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("quotes the platform rate when Shipbubble errors", async () => {
    vi.mocked(validateShipbubbleAddress).mockRejectedValue(
      new Error("Shipbubble request failed: Service unavailable"),
    );

    const quote = await quoteStoreDelivery(store, address, [], {
      subtotal: 20000,
      settings: settings({ defaultDeliveryFee: 1500 }),
    });

    expect(quote.available).toBe(true);
    expect(quote.selectedOptionId).toBe("platform:standard");
    expect(quote.options[0]).toMatchObject({
      provider: "platform",
      fee: 1500,
      currency: "NGN",
    });
    expect(quote.options[0].note).toContain("development fallback");
    expect(quote.options[0].note).toContain("courier quote was unavailable");
  });

  it("falls back when the provider cannot verify the delivery address", async () => {
    vi.mocked(validateShipbubbleAddress).mockResolvedValue({
      addressCode: null,
      formattedAddress: null,
      latitude: null,
      longitude: null,
      raw: {},
    });

    const quote = await quoteStoreDelivery(store, address, [], {
      subtotal: 20000,
      settings: settings({ defaultDeliveryFee: 1200 }),
    });

    expect(quote.available).toBe(true);
    expect(quote.options[0].fee).toBe(1200);
    expect(fetchShipbubbleRates).not.toHaveBeenCalled();
  });

  it("still returns live rates when Shipbubble succeeds", async () => {
    vi.mocked(validateShipbubbleAddress).mockResolvedValue({
      addressCode: "ADDR-1",
      formattedAddress: null,
      latitude: null,
      longitude: null,
      raw: {},
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
        raw: {},
      },
    ]);

    const quote = await quoteStoreDelivery(store, address, [], {
      subtotal: 20000,
      settings: settings({ defaultDeliveryFee: 1500 }),
    });

    expect(quote.available).toBe(true);
    expect(quote.options[0]).toMatchObject({
      id: "shipbubble:10:standard",
      provider: "shipbubble",
      fee: 1800,
    });
  });
});
