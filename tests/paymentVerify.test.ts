import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/models/checkoutIntent.model", () => ({
  default: { findOne: vi.fn() },
}));
vi.mock("@/models/order.model", () => ({
  default: { find: vi.fn() },
}));
vi.mock("@/models/payment.model", () => ({
  default: { countDocuments: vi.fn() },
}));
vi.mock("@/services/payments/apply", () => ({
  applyPaymentSuccess: vi.fn(),
  markCheckoutPaymentFailed: vi.fn(),
}));
vi.mock("@/services/payments/paystack", () => ({
  isPaystackConfigured: true,
  verifyPaystackTransaction: vi.fn(),
}));

import CheckoutIntent from "@/models/checkoutIntent.model";
import Order from "@/models/order.model";
import Payment from "@/models/payment.model";
import {
  applyPaymentSuccess,
  markCheckoutPaymentFailed,
} from "@/services/payments/apply";
import { verifyPaystackTransaction } from "@/services/payments/paystack";
import { verifyCheckoutPayment } from "@/services/payments/verify";

const orders = [
  {
    _id: "o1",
    orderNumber: "RQ-1",
    store: "s1",
    total: 55000,
    paymentStatus: "pending",
    status: "pending",
  },
];

const intentDoc = (overrides: Record<string, unknown> = {}) =>
  ({
    _id: "i1",
    masterOrderNumber: "RQ-M-1",
    customer: "c1",
    status: "initialized",
    total: 55000,
    orders: ["o1"],
    payments: ["pay1"],
    providerReference: "PROVIDER-REF",
    paidAt: null,
    save: vi.fn(async () => undefined),
    ...overrides,
  }) as never;

const leanChain = (rows: unknown[]) => ({
  sort: () => ({ lean: async () => rows }),
});

describe("verifyCheckoutPayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Order.find).mockReturnValue(leanChain(orders) as never);
    vi.mocked(Payment.countDocuments).mockResolvedValue(0 as never);
    vi.mocked(applyPaymentSuccess).mockResolvedValue({} as never);
    vi.mocked(markCheckoutPaymentFailed).mockResolvedValue({} as never);
  });

  it("applies a provider-confirmed success to the whole order group", async () => {
    const intent = intentDoc();
    vi.mocked(CheckoutIntent.findOne).mockResolvedValue(intent);
    vi.mocked(verifyPaystackTransaction).mockResolvedValue({
      status: "success",
      amount: 55000,
      currency: "NGN",
      transactionId: "tx-1",
      channel: "card",
      paidAt: new Date("2026-11-14T10:00:00.000Z"),
      gatewayResponse: "Approved",
      raw: { id: 1 },
    } as never);

    const result = await verifyCheckoutPayment({
      masterOrderNumber: "RQ-M-1",
      customerId: "c1",
    });

    expect(result).toMatchObject({
      masterOrderNumber: "RQ-M-1",
      status: "paid",
      message: "Payment confirmed.",
      paymentReference: "PROVIDER-REF",
      paidAt: "2026-11-14T10:00:00.000Z",
    });
    expect(result.orders).toEqual([
      {
        _id: "o1",
        orderNumber: "RQ-1",
        store: "s1",
        total: 55000,
        paymentStatus: "pending",
        status: "pending",
      },
    ]);
    expect(applyPaymentSuccess).toHaveBeenCalledWith({
      masterOrderNumber: "RQ-M-1",
      providerReference: "PROVIDER-REF",
      transactionId: "tx-1",
      channel: "card",
      paidAt: new Date("2026-11-14T10:00:00.000Z"),
      gatewayResponse: "Approved",
      raw: { id: 1 },
    });
    expect(markCheckoutPaymentFailed).not.toHaveBeenCalled();
  });

  it("refuses a success whose amount is not the checkout total", async () => {
    vi.mocked(CheckoutIntent.findOne).mockResolvedValue(intentDoc());
    vi.mocked(verifyPaystackTransaction).mockResolvedValue({
      status: "success",
      amount: 1000,
      currency: "NGN",
      transactionId: "tx-1",
      channel: "card",
      paidAt: new Date(),
      gatewayResponse: "Approved",
      raw: {},
    } as never);

    await expect(
      verifyCheckoutPayment({
        masterOrderNumber: "RQ-M-1",
        customerId: "c1",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(applyPaymentSuccess).not.toHaveBeenCalled();
  });

  it("records a failed provider attempt", async () => {
    const intent = intentDoc();
    vi.mocked(CheckoutIntent.findOne).mockResolvedValue(intent);
    vi.mocked(verifyPaystackTransaction).mockResolvedValue({
      status: "failed",
      amount: 55000,
      currency: "NGN",
      transactionId: null,
      channel: "card",
      paidAt: null,
      gatewayResponse: "Declined",
      raw: {},
    } as never);

    const result = await verifyCheckoutPayment({
      masterOrderNumber: "RQ-M-1",
      customerId: "c1",
    });

    expect(result).toMatchObject({
      status: "failed",
      message: "Declined",
      paidAt: null,
    });
    expect(markCheckoutPaymentFailed).toHaveBeenCalledWith(intent, "Declined");
    expect(applyPaymentSuccess).not.toHaveBeenCalled();
  });

  it("treats an abandoned checkout as failed, not pending", async () => {
    vi.mocked(CheckoutIntent.findOne).mockResolvedValue(intentDoc());
    vi.mocked(verifyPaystackTransaction).mockResolvedValue({
      status: "abandoned",
      amount: 0,
      currency: "NGN",
      transactionId: null,
      channel: null,
      paidAt: null,
      gatewayResponse: null,
      raw: {},
    } as never);

    const result = await verifyCheckoutPayment({
      masterOrderNumber: "RQ-M-1",
      customerId: "c1",
    });

    expect(result.status).toBe("failed");
    expect(result.message).toBe(
      "The payment was not completed. You can try again.",
    );
    expect(markCheckoutPaymentFailed).toHaveBeenCalled();
  });

  it("stays pending while the provider has no verdict", async () => {
    vi.mocked(CheckoutIntent.findOne).mockResolvedValue(intentDoc());
    vi.mocked(verifyPaystackTransaction).mockResolvedValue({
      status: "pending",
      amount: 0,
      currency: "NGN",
      transactionId: null,
      channel: null,
      paidAt: null,
      gatewayResponse: null,
      raw: {},
    } as never);

    const result = await verifyCheckoutPayment({
      masterOrderNumber: "RQ-M-1",
      customerId: "c1",
    });

    expect(result.status).toBe("pending");
    expect(result.message).toContain("not received confirmation");
    expect(result.paidAt).toBeNull();
    expect(applyPaymentSuccess).not.toHaveBeenCalled();
  });

  it("reports paid when an earlier webhook already settled the group", async () => {
    vi.mocked(CheckoutIntent.findOne).mockResolvedValue(intentDoc());
    vi.mocked(verifyPaystackTransaction).mockResolvedValue({
      status: "pending",
      amount: 0,
      currency: "NGN",
      transactionId: null,
      channel: null,
      paidAt: null,
      gatewayResponse: null,
      raw: {},
    } as never);
    vi.mocked(Payment.countDocuments).mockResolvedValue(1 as never);

    const result = await verifyCheckoutPayment({
      masterOrderNumber: "RQ-M-1",
      customerId: "c1",
    });

    expect(result.status).toBe("paid");
    expect(result.message).toBe("Payment confirmed.");
    expect(verifyPaystackTransaction).toHaveBeenCalled();
  });

  it("does not call the provider for an already-paid checkout", async () => {
    vi.mocked(CheckoutIntent.findOne).mockResolvedValue(
      intentDoc({
        status: "paid",
        paidAt: new Date("2026-11-14T09:30:00.000Z"),
      }),
    );

    const result = await verifyCheckoutPayment({
      masterOrderNumber: "RQ-M-1",
      customerId: "c1",
    });

    expect(result.status).toBe("paid");
    expect(result.message).toBe("This order group is already paid.");
    expect(result.paidAt).toBe("2026-11-14T09:30:00.000Z");
    expect(verifyPaystackTransaction).not.toHaveBeenCalled();
  });

  it("requires a recorded payment attempt", async () => {
    vi.mocked(CheckoutIntent.findOne).mockResolvedValue(
      intentDoc({ providerReference: null }),
    );

    await expect(
      verifyCheckoutPayment({
        masterOrderNumber: "RQ-M-1",
        customerId: "c1",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(verifyPaystackTransaction).not.toHaveBeenCalled();
  });

  it("hides another customer's checkout", async () => {
    vi.mocked(CheckoutIntent.findOne).mockResolvedValue(null);

    await expect(
      verifyCheckoutPayment({
        masterOrderNumber: "RQ-M-404",
        customerId: "c2",
      }),
    ).rejects.toMatchObject({ statusCode: 404, message: "Checkout not found" });

    expect(CheckoutIntent.findOne).toHaveBeenCalledWith({
      masterOrderNumber: "RQ-M-404",
      customer: "c2",
    });
  });
});
