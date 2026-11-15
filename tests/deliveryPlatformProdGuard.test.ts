import { describe, expect, it, vi } from "vitest";

vi.mock("@/config/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/config/env")>()),
  DELIVERY_PLATFORM_FALLBACK: true,
  NODE_ENV: "production",
}));

vi.mock("@/services/shipments/provider", () => ({
  isShipbubbleConfigured: true,
  validateShipbubbleAddress: vi.fn(),
  fetchShipbubbleRates: vi.fn(),
}));

import { quoteStoreDelivery } from "@/services/delivery";
import { validateShipbubbleAddress } from "@/services/shipments/provider";
import { DEFAULT_SETTINGS, type PlatformSettingsView } from "@/services/settings";

const settings = {
  ...DEFAULT_SETTINGS,
  shipping: { ...DEFAULT_SETTINGS.shipping, defaultDeliveryFee: 1500 },
} as PlatformSettingsView;

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

describe("production keeps delivery fail-closed", () => {
  it("never falls back to the platform rate when Shipbubble fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.mocked(validateShipbubbleAddress).mockRejectedValue(
      new Error("Shipbubble request failed: Service unavailable"),
    );

    const quote = await quoteStoreDelivery(
      store,
      {
        recipientName: "Ada Checkout",
        phone: "08012345678",
        street: "4 Freedom Way",
        city: "Lekki",
        lga: "Eti-Osa",
        state: "Lagos",
        country: "Nigeria",
      },
      [],
      { subtotal: 20000, settings },
    );

    expect(quote.available).toBe(false);
    expect(quote.options).toEqual([]);
    expect(quote.message).toContain("could not be calculated with Shipbubble");
    consoleError.mockRestore();
  });
});
