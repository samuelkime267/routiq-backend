import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/models/checkoutIntent.model", () => ({
  default: { findOne: vi.fn() },
}));
vi.mock("@/models/order.model", () => ({
  default: { findById: vi.fn() },
}));
vi.mock("@/models/payment.model", () => ({
  default: { find: vi.fn(), updateMany: vi.fn() },
}));
vi.mock("@/models/escrow.model", () => ({
  default: { findOneAndUpdate: vi.fn() },
}));
vi.mock("@/lib/activity", () => ({ recordActivity: vi.fn() }));

import CheckoutIntent from "@/models/checkoutIntent.model";
import Escrow from "@/models/escrow.model";
import Order from "@/models/order.model";
import Payment from "@/models/payment.model";
import { recordActivity } from "@/lib/activity";
import {
  applyPaymentSuccess,
  mapPaymentChannel,
  markCheckoutPaymentFailed,
  resetCheckoutPayment,
} from "@/services/payments/apply";

const orderDoc = (overrides: Record<string, unknown> = {}) =>
  ({
    _id: "o1",
    orderNumber: "RQ-1",
    paymentStatus: "pending",
    status: "pending",
    timeline: [],
    save: vi.fn(async () => undefined),
    ...overrides,
  }) as never;

const paymentDoc = (overrides: Record<string, unknown> = {}) =>
  ({
    _id: "pay1",
    order: "o1",
    store: "s1",
    vendor: "v1",
    amount: 55000,
    vendorAmount: 50875,
    status: "pending",
    channel: null,
    paidAt: null,
    failureReason: "earlier failure",
    providerReference: "OLD-REF",
    providerTransactionId: null,
    providerMetadata: null,
    save: vi.fn(async () => undefined),
    ...overrides,
  }) as never;

const intentDoc = (overrides: Record<string, unknown> = {}) =>
  ({
    _id: "i1",
    masterOrderNumber: "RQ-M-1",
    payments: ["pay1"],
    providerReference: "PROVIDER-REF",
    status: "initialized",
    paidAt: null,
    failureReason: null,
    save: vi.fn(async () => undefined),
    ...overrides,
  }) as never;

/** `findById` is awaited directly and also chained with `.select()`. */
function orderLookup(orders: Record<string, unknown>) {
  vi.mocked(Order.findById).mockImplementation((id: unknown) => {
    const doc = orders[String(id)];
    const promise = Promise.resolve(doc) as Promise<unknown> & {
      select: () => Promise<unknown>;
    };
    promise.select = async () => doc;

    return promise as never;
  });
}

describe("applyPaymentSuccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(recordActivity).mockResolvedValue(undefined as never);
    vi.mocked(Escrow.findOneAndUpdate).mockResolvedValue({} as never);
  });

  it("marks every sub-order paid and holds each vendor's proceeds in escrow", async () => {
    const intent = intentDoc();
    const payment = paymentDoc();
    const order = orderDoc();

    vi.mocked(CheckoutIntent.findOne).mockResolvedValue(intent);
    vi.mocked(Payment.find).mockResolvedValue([payment] as never);
    orderLookup({ o1: order });

    const result = await applyPaymentSuccess({
      masterOrderNumber: "RQ-M-1",
      providerReference: "PROVIDER-REF",
      transactionId: "tx-1",
      channel: "bank",
      paidAt: new Date("2026-11-14T10:00:00.000Z"),
      gatewayResponse: "Approved",
      raw: { status: "success" },
    });

    expect(result).toMatchObject({
      applied: true,
      alreadyPaid: false,
      paymentStatus: "paid",
      orderNumbers: ["RQ-1"],
    });

    expect(payment.status).toBe("successful");
    expect(payment.channel).toBe("bank_transfer");
    expect(payment.failureReason).toBeNull();
    expect(payment.providerReference).toBe("PROVIDER-REF");
    expect(payment.providerTransactionId).toBe("tx-1");
    expect(payment.providerMetadata).toEqual({ status: "success" });
    expect(payment.save).toHaveBeenCalled();

    expect(order.paymentStatus).toBe("paid");
    expect(order.status).toBe("confirmed");
    expect(order.timeline).toEqual([
      expect.objectContaining({
        type: "payment_confirmed",
        occurredAt: new Date("2026-11-14T10:00:00.000Z"),
      }),
    ]);
    expect(order.save).toHaveBeenCalled();

    expect(Escrow.findOneAndUpdate).toHaveBeenCalledWith(
      { order: "o1" },
      {
        $setOnInsert: expect.objectContaining({
          payment: "pay1",
          amountHeld: 50875,
          amountReleased: 0,
          status: "held",
        }),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    expect(intent.status).toBe("paid");
    expect(intent.paidAt).toEqual(new Date("2026-11-14T10:00:00.000Z"));
    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "payment_confirmed",
        subject: { type: "order", id: "o1", label: "RQ-1" },
      }),
    );
  });

  it("is idempotent when the same payment is applied twice", async () => {
    const intent = intentDoc({ status: "paid" });
    const payment = paymentDoc({ status: "successful" });
    const order = orderDoc({ paymentStatus: "paid", status: "confirmed" });

    vi.mocked(CheckoutIntent.findOne).mockResolvedValue(intent);
    vi.mocked(Payment.find).mockResolvedValue([payment] as never);
    orderLookup({ o1: order });

    const result = await applyPaymentSuccess({
      masterOrderNumber: "RQ-M-1",
      providerReference: "PROVIDER-REF",
    });

    expect(result).toMatchObject({
      applied: false,
      alreadyPaid: true,
      orderNumbers: ["RQ-1"],
    });
    expect(payment.save).not.toHaveBeenCalled();
    expect(order.save).not.toHaveBeenCalled();
    expect(Escrow.findOneAndUpdate).not.toHaveBeenCalled();
    expect(intent.save).not.toHaveBeenCalled();
  });

  it("returns a pending result when the checkout no longer exists", async () => {
    vi.mocked(CheckoutIntent.findOne).mockResolvedValue(null);

    const result = await applyPaymentSuccess({
      masterOrderNumber: "RQ-M-404",
    });

    expect(result).toEqual({
      applied: false,
      alreadyPaid: false,
      masterOrderNumber: "RQ-M-404",
      paymentStatus: "pending",
      orderNumbers: [],
    });
    expect(Payment.find).not.toHaveBeenCalled();
  });

  it("maps provider channels to the stored enum", () => {
    expect(mapPaymentChannel("bank")).toBe("bank_transfer");
    expect(mapPaymentChannel("bank_transfer")).toBe("bank_transfer");
    expect(mapPaymentChannel("ussd")).toBe("ussd");
    expect(mapPaymentChannel("mobile_money")).toBe("wallet");
    expect(mapPaymentChannel("card")).toBe("card");
    expect(mapPaymentChannel(null)).toBe("card");
  });
});

describe("failed payment handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Payment.updateMany).mockResolvedValue({} as never);
  });

  it("records a failure without touching a successful payment", async () => {
    const intent = intentDoc();

    await markCheckoutPaymentFailed(intent, "Insufficient funds");

    expect(Payment.updateMany).toHaveBeenCalledWith(
      { _id: { $in: ["pay1"] }, status: { $ne: "successful" } },
      { $set: { status: "failed", failureReason: "Insufficient funds" } },
    );
    expect(intent.status).toBe("failed");
    expect(intent.failureReason).toBe("Insufficient funds");
    expect(intent.save).toHaveBeenCalled();
  });

  it("resets a failed attempt for retry while keeping the stock reservation", async () => {
    const intent = intentDoc({ status: "failed", authorizationUrl: "old" });

    await resetCheckoutPayment(intent, "NEW-REF");

    expect(Payment.updateMany).toHaveBeenCalledWith(
      { _id: { $in: ["pay1"] }, status: { $ne: "successful" } },
      {
        $set: {
          status: "pending",
          failureReason: null,
          providerReference: "NEW-REF",
          providerTransactionId: null,
          authorizationUrl: null,
          accessCode: null,
        },
      },
    );
    expect(intent.status).toBe("created");
    expect(intent.providerReference).toBe("NEW-REF");
    expect(intent.authorizationUrl).toBeNull();
    expect(intent.failureReason).toBeNull();
    expect(intent.save).toHaveBeenCalled();
  });
});
