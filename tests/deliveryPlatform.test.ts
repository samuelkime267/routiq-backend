import { describe, expect, it, vi } from "vitest";

vi.mock("@/services/shipments/provider", () => ({
  isShipbubbleConfigured: false,
  validateShipbubbleAddress: vi.fn(),
  fetchShipbubbleRates: vi.fn(),
}));

import {
  buildPlatformDeliveryOption,
  estimatedDeliveryAt,
  normaliseNigerianPhone,
  quoteStoreDelivery,
  selectDeliveryOption,
} from "@/services/delivery";
import { DEFAULT_SETTINGS, type PlatformSettingsView } from "@/services/settings";

const settings = (shipping: Partial<PlatformSettingsView["shipping"]> = {}) =>
  ({
    ...DEFAULT_SETTINGS,
    shipping: { ...DEFAULT_SETTINGS.shipping, ...shipping },
  }) as PlatformSettingsView;

const store = {
  _id: "s1",
  name: "TechHub Lagos",
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

describe("platform delivery fallback", () => {
  it("charges the configured standard rate and delivery window", () => {
    const option = buildPlatformDeliveryOption(
      settings({ defaultDeliveryFee: 1500, estimatedDeliveryDays: 3 }),
      20000,
    );

    expect(option).toMatchObject({
      id: "platform:standard",
      provider: "platform",
      fee: 1500,
      currency: "NGN",
      estimatedDaysMin: 3,
      estimatedDaysMax: 3,
    });
    expect(option.estimatedDeliveryText).toBe("3 business days");
  });

  it("offers free delivery above the configured threshold", () => {
    const option = buildPlatformDeliveryOption(
      settings({ defaultDeliveryFee: 2000, freeShippingThreshold: 50000 }),
      53000,
    );

    expect(option.fee).toBe(0);
    expect(option.note).toContain("Free delivery");
  });

  it("never rounds the estimate below one business day", () => {
    const option = buildPlatformDeliveryOption(
      settings({ estimatedDeliveryDays: 0 }),
      1000,
    );

    expect(option.estimatedDaysMin).toBe(1);
    expect(option.estimatedDaysMax).toBe(1);
  });

  it("quotes one available option per store when Shipbubble is not configured", async () => {
    const quote = await quoteStoreDelivery(store, address, [], {
      subtotal: 10000,
      settings: settings({ defaultDeliveryFee: 1500 }),
    });

    expect(quote.available).toBe(true);
    expect(quote.options).toHaveLength(1);
    expect(quote.selectedOptionId).toBe("platform:standard");
    expect(quote.options[0].fee).toBe(1500);
    expect(quote.message).toBeNull();
  });

  it("selects the requested option, then the quote default, then the cheapest", () => {
    const base = {
      available: true,
      options: [
        {
          id: "a",
          courier: "A",
          service: null,
          fee: 2500,
          currency: "NGN" as const,
          provider: "shipbubble" as const,
          estimatedDaysMin: 2,
          estimatedDaysMax: 3,
          estimatedDeliveryText: null,
          note: null,
        },
        {
          id: "b",
          courier: "B",
          service: null,
          fee: 1200,
          currency: "NGN" as const,
          provider: "shipbubble" as const,
          estimatedDaysMin: 4,
          estimatedDaysMax: 5,
          estimatedDeliveryText: null,
          note: null,
        },
      ],
      selectedOptionId: "a",
      message: null,
    };

    expect(selectDeliveryOption(base, "b")?.id).toBe("b");
    expect(selectDeliveryOption(base, "missing")?.id).toBe("a");
    expect(
      selectDeliveryOption({ ...base, selectedOptionId: "missing" })?.id,
    ).toBe("b");
    expect(
      selectDeliveryOption({
        available: false,
        options: [],
        selectedOptionId: null,
        message: "No delivery",
      }),
    ).toBeNull();
  });

  it("estimates delivery from the selected option's longest window", () => {
    const at = estimatedDeliveryAt(
      {
        available: true,
        options: [
          {
            id: "a",
            courier: "A",
            service: null,
            fee: 1000,
            currency: "NGN",
            provider: "platform",
            estimatedDaysMin: 2,
            estimatedDaysMax: 4,
            estimatedDeliveryText: null,
            note: null,
          },
        ],
        selectedOptionId: "a",
        message: null,
      },
      new Date("2026-11-14T00:00:00.000Z"),
    );

    expect(at?.toISOString()).toBe("2026-11-18T00:00:00.000Z");
  });

  it("normalises Nigerian phone numbers for provider payloads", () => {
    expect(normaliseNigerianPhone("0801 234 5678")).toBe("+2348012345678");
    expect(normaliseNigerianPhone("+2348012345678")).toBe("+2348012345678");
    expect(normaliseNigerianPhone("2348012345678")).toBe("+2348012345678");
  });
});
