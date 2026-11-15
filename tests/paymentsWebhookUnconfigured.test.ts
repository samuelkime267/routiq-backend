import { describe, expect, it, vi } from "vitest";

vi.mock("@/models/checkoutIntent.model", () => ({
  default: { findOne: vi.fn() },
}));
vi.mock("@/models/providerWebhookEvent.model", () => ({
  default: { create: vi.fn() },
}));
vi.mock("@/services/payments/apply", () => ({
  applyPaymentSuccess: vi.fn(),
  markCheckoutPaymentFailed: vi.fn(),
}));
vi.mock("@/services/payments/paystack", () => ({
  isPaystackConfigured: false,
  verifyPaystackSignature: vi.fn(),
}));

import ProviderWebhookEvent from "@/models/providerWebhookEvent.model";
import { applyPaymentSuccess } from "@/services/payments/apply";
import { processPaystackWebhook } from "@/services/payments/webhook";

describe("Paystack webhook without configuration", () => {
  it("returns 503 instead of trusting an unsigned request", async () => {
    const payload = {
      event: "charge.success",
      data: { reference: "PROVIDER-REF", status: "success", amount: 5_500_000 },
    };

    await expect(
      processPaystackWebhook({
        rawBody: JSON.stringify(payload),
        signature: null,
        payload,
      }),
    ).rejects.toMatchObject({ statusCode: 503 });

    expect(ProviderWebhookEvent.create).not.toHaveBeenCalled();
    expect(applyPaymentSuccess).not.toHaveBeenCalled();
  });
});
