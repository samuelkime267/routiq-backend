import { beforeEach, describe, expect, it, vi } from "vitest";

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
  isPaystackConfigured: true,
  verifyPaystackSignature: vi.fn(),
}));

import CheckoutIntent from "@/models/checkoutIntent.model";
import ProviderWebhookEvent from "@/models/providerWebhookEvent.model";
import {
  applyPaymentSuccess,
  markCheckoutPaymentFailed,
} from "@/services/payments/apply";
import { verifyPaystackSignature } from "@/services/payments/paystack";
import { processPaystackWebhook } from "@/services/payments/webhook";

const intentDoc = (overrides: Record<string, unknown> = {}) =>
  ({
    _id: "i1",
    masterOrderNumber: "RQ-M-1",
    total: 55000,
    status: "initialized",
    providerReference: "PROVIDER-REF",
    save: vi.fn(async () => undefined),
    ...overrides,
  }) as never;

const ledgerDoc = () =>
  ({
    status: "processing",
    error: null,
    processedAt: null,
    save: vi.fn(async () => undefined),
  }) as never;

const rawBody = (payload: unknown) => JSON.stringify(payload);

const successPayload = (overrides: Record<string, unknown> = {}) => ({
  event: "charge.success",
  data: {
    id: 9001,
    reference: "PROVIDER-REF",
    status: "success",
    amount: 5_500_000,
    currency: "NGN",
    channel: "card",
    paid_at: "2026-11-14T10:00:00.000Z",
    gateway_response: "Approved",
    ...overrides,
  },
});

describe("Paystack webhook", () => {
  let ledger: ReturnType<typeof ledgerDoc>;

  beforeEach(() => {
    vi.clearAllMocks();
    ledger = ledgerDoc();
    vi.mocked(ProviderWebhookEvent.create).mockResolvedValue(ledger as never);
    vi.mocked(verifyPaystackSignature).mockReturnValue(true);
    vi.mocked(CheckoutIntent.findOne).mockResolvedValue(intentDoc());
    vi.mocked(applyPaymentSuccess).mockResolvedValue({} as never);
    vi.mocked(markCheckoutPaymentFailed).mockResolvedValue({} as never);
  });

  it("applies a correctly signed, correctly priced charge.success", async () => {
    const payload = successPayload();

    const result = await processPaystackWebhook({
      rawBody: rawBody(payload),
      signature: "signature",
      payload,
      now: new Date("2026-11-14T10:01:00.000Z"),
    });

    expect(result).toEqual({
      received: true,
      duplicate: false,
      processed: true,
      status: "processed",
      message: "Payment confirmed and applied to the order group.",
    });
    expect(verifyPaystackSignature).toHaveBeenCalledWith(
      rawBody(payload),
      "signature",
    );
    expect(applyPaymentSuccess).toHaveBeenCalledWith({
      masterOrderNumber: "RQ-M-1",
      providerReference: "PROVIDER-REF",
      transactionId: "9001",
      channel: "card",
      paidAt: new Date("2026-11-14T10:00:00.000Z"),
      gatewayResponse: "Approved",
      raw: payload.data,
    });
    expect(ledger.status).toBe("processed");
    expect(ledger.save).toHaveBeenCalled();
  });

  it("rejects a webhook with an invalid signature", async () => {
    vi.mocked(verifyPaystackSignature).mockReturnValue(false);
    const payload = successPayload();

    await expect(
      processPaystackWebhook({
        rawBody: rawBody(payload),
        signature: "bad",
        payload,
      }),
    ).rejects.toMatchObject({ statusCode: 401 });

    expect(ProviderWebhookEvent.create).not.toHaveBeenCalled();
    expect(applyPaymentSuccess).not.toHaveBeenCalled();
  });

  it("ignores a replayed webhook without reapplying the payment", async () => {
    vi.mocked(ProviderWebhookEvent.create).mockRejectedValue(
      Object.assign(new Error("duplicate"), { code: 11000 }) as never,
    );

    const result = await processPaystackWebhook({
      rawBody: rawBody(successPayload()),
      signature: "signature",
      payload: successPayload(),
    });

    expect(result).toEqual({
      received: true,
      duplicate: true,
      processed: false,
      status: "duplicate",
      message: "Duplicate Paystack webhook ignored.",
    });
    expect(CheckoutIntent.findOne).not.toHaveBeenCalled();
    expect(applyPaymentSuccess).not.toHaveBeenCalled();
  });

  it("ignores a successful charge whose amount does not match the total", async () => {
    const payload = successPayload({ amount: 1_000_000 });

    const result = await processPaystackWebhook({
      rawBody: rawBody(payload),
      signature: "signature",
      payload,
    });

    expect(result).toMatchObject({
      status: "ignored",
      processed: false,
      message: "Payment amount did not match the checkout total.",
    });
    expect(applyPaymentSuccess).not.toHaveBeenCalled();
    expect(ledger.status).toBe("ignored");
    expect(ledger.error).toContain("Amount mismatch");
  });

  it("records charge.failed without marking the order paid", async () => {
    const payload = {
      event: "charge.failed",
      data: {
        id: 9002,
        reference: "PROVIDER-REF",
        status: "failed",
        amount: 5_500_000,
        gateway_response: "Insufficient funds",
      },
    };

    const result = await processPaystackWebhook({
      rawBody: rawBody(payload),
      signature: "signature",
      payload,
    });

    expect(result).toMatchObject({
      status: "processed",
      message: "Failed payment recorded.",
    });
    expect(markCheckoutPaymentFailed).toHaveBeenCalledWith(
      expect.objectContaining({ masterOrderNumber: "RQ-M-1" }),
      "Insufficient funds",
    );
    expect(applyPaymentSuccess).not.toHaveBeenCalled();
  });

  it("records a failed status even for a charge.success envelope", async () => {
    const payload = successPayload({ status: "failed" });

    const result = await processPaystackWebhook({
      rawBody: rawBody(payload),
      signature: "signature",
      payload,
    });

    expect(result.status).toBe("processed");
    expect(markCheckoutPaymentFailed).toHaveBeenCalled();
    expect(applyPaymentSuccess).not.toHaveBeenCalled();
  });

  it("ignores a reference that belongs to no checkout", async () => {
    vi.mocked(CheckoutIntent.findOne).mockResolvedValue(null);
    const payload = successPayload({ reference: "UNKNOWN" });

    const result = await processPaystackWebhook({
      rawBody: rawBody(payload),
      signature: "signature",
      payload,
    });

    expect(result).toMatchObject({
      status: "ignored",
      processed: false,
      message: "Webhook does not match a Routiq checkout.",
    });
    expect(applyPaymentSuccess).not.toHaveBeenCalled();
  });

  it("ignores a payload without a transaction reference", async () => {
    const payload = successPayload({ reference: "" });

    const result = await processPaystackWebhook({
      rawBody: rawBody(payload),
      signature: "signature",
      payload,
    });

    expect(result).toMatchObject({
      status: "ignored",
      message: "Webhook payload has no transaction reference.",
    });
    expect(CheckoutIntent.findOne).not.toHaveBeenCalled();
  });

  it("acknowledges unhandled events without changing the checkout", async () => {
    const payload = {
      event: "transfer.success",
      data: { id: 1, reference: "PROVIDER-REF", status: "success" },
    };

    const result = await processPaystackWebhook({
      rawBody: rawBody(payload),
      signature: "signature",
      payload,
    });

    expect(result).toMatchObject({
      status: "ignored",
      processed: false,
      message: "Webhook acknowledged without changing the checkout.",
    });
    expect(applyPaymentSuccess).not.toHaveBeenCalled();
    expect(markCheckoutPaymentFailed).not.toHaveBeenCalled();
  });

  it("rejects a malformed payload", async () => {
    await expect(
      processPaystackWebhook({
        rawBody: "[]",
        signature: "signature",
        payload: [],
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    await expect(
      processPaystackWebhook({
        rawBody: "{}",
        signature: "signature",
        payload: {},
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
