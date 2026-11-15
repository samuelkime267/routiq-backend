import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/models/checkoutIntent.model", () => ({
  default: { findOne: vi.fn() },
}));
vi.mock("@/models/order.model", () => ({
  default: { find: vi.fn() },
}));
vi.mock("@/models/payment.model", () => ({
  default: { find: vi.fn() },
}));
vi.mock("@/services/payments/paystack", () => ({
  isPaystackConfigured: true,
  initializePaystackTransaction: vi.fn(),
  verifyPaystackTransaction: vi.fn(),
  verifyPaystackSignature: vi.fn(),
}));

import CheckoutIntent from "@/models/checkoutIntent.model";
import Order from "@/models/order.model";
import Payment from "@/models/payment.model";
import { getCheckoutState } from "@/services/checkout/state";

const address = {
  _id: "a1",
  label: "Home",
  recipientName: "Ada Checkout",
  phone: "08012345678",
  street: "4 Freedom Way",
  city: "Lekki",
  lga: "Eti-Osa",
  state: "Lagos",
  country: "Nigeria",
  landmark: null,
  postalCode: null,
};

const group = {
  store: {
    _id: "s1",
    name: "TechHub Lagos",
    slug: "techhub-lagos",
    logo: null,
    city: "Lekki",
    state: "Lagos",
  },
  vendor: "v1",
  items: [
    {
      product: "p1",
      name: "4K Streaming Stick",
      quantity: 1,
      unitPrice: 53500,
      lineTotal: 53500,
      priceChanged: false,
    },
  ],
  subtotal: 53500,
  delivery: { available: true, options: [], selectedOptionId: null, message: null },
  selectedDelivery: {
    id: "platform:standard",
    courier: "Routiq standard",
    service: null,
    fee: 1500,
    currency: "NGN",
    provider: "platform",
    estimatedDaysMin: 3,
    estimatedDaysMax: 3,
    estimatedDeliveryText: "3 business days",
    note: null,
  },
  deliveryFee: 1500,
  discount: 0,
  total: 55000,
  estimatedDeliveryAt: "2026-11-17T09:00:00.000Z",
};

const summary = {
  currency: "NGN",
  itemCount: 1,
  subtotal: 53500,
  deliveryFee: 1500,
  serviceFee: 0,
  discount: 0,
  total: 55000,
};

const intentDoc = (overrides: Record<string, unknown> = {}) =>
  ({
    _id: "i1",
    masterOrderNumber: "RQ-M-1",
    customer: "c1",
    status: "initialized",
    orders: ["o1"],
    payments: ["pay1"],
    subtotal: 53500,
    deliveryFee: 1500,
    serviceFee: 0,
    discount: 0,
    total: 55000,
    snapshot: { groups: [group], summary, address },
    provider: "paystack",
    providerReference: "PROVIDER-REF",
    providerTransactionId: null,
    authorizationUrl: "https://checkout.paystack.test/abc",
    accessCode: "access-1",
    failureReason: null,
    paidAt: null,
    createdAt: new Date("2026-11-14T09:00:00.000Z"),
    ...overrides,
  }) as never;

const orderDoc = (overrides: Record<string, unknown> = {}) => ({
  _id: "o1",
  orderNumber: "RQ-1",
  subOrderNumber: "RQ-M-1-A",
  store: "s1",
  status: "confirmed",
  paymentStatus: "paid",
  subtotal: 53500,
  shippingFee: 1500,
  discount: 0,
  total: 55000,
  items: [{ product: "p1", quantity: 1, unitPrice: 53500, total: 53500 }],
  expectedDeliveryAt: new Date("2026-11-17T09:00:00.000Z"),
  placedAt: new Date("2026-11-14T09:00:00.000Z"),
  createdAt: new Date("2026-11-14T09:00:00.000Z"),
  ...overrides,
});

const paymentDoc = (overrides: Record<string, unknown> = {}) => ({
  _id: "pay1",
  status: "pending",
  createdAt: new Date("2026-11-14T09:00:00.000Z"),
  ...overrides,
});

const leanChain = (rows: unknown[]) => ({
  sort: () => ({ lean: async () => rows }),
});

describe("getCheckoutState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(CheckoutIntent.findOne).mockResolvedValue(intentDoc());
    vi.mocked(Order.find).mockReturnValue(leanChain([orderDoc()]) as never);
    vi.mocked(Payment.find).mockReturnValue(leanChain([paymentDoc()]) as never);
  });

  it("reports a paid checkout with its snapshot and sub-orders", async () => {
    vi.mocked(CheckoutIntent.findOne).mockResolvedValue(
      intentDoc({
        status: "paid",
        paidAt: new Date("2026-11-14T10:00:00.000Z"),
      }),
    );
    vi.mocked(Payment.find).mockReturnValue(
      leanChain([paymentDoc({ status: "successful" })]) as never,
    );

    const state = await getCheckoutState("RQ-M-1", "c1");

    expect(state).toMatchObject({
      masterOrderNumber: "RQ-M-1",
      status: "paid",
      paidAt: new Date("2026-11-14T10:00:00.000Z"),
      createdAt: new Date("2026-11-14T09:00:00.000Z"),
      summary,
      address,
    });
    expect(state.groups).toHaveLength(1);
    expect(state.groups[0]).toMatchObject({
      store: group.store,
      items: group.items,
      total: 55000,
      delivery: group.selectedDelivery,
    });
    expect(state.orders).toEqual([
      expect.objectContaining({
        _id: "o1",
        orderNumber: "RQ-1",
        subOrderNumber: "RQ-M-1-A",
        store: "s1",
        itemCount: 1,
        total: 55000,
      }),
    ]);
    expect(state.payment).toEqual({
      provider: "paystack",
      reference: "PROVIDER-REF",
      initialized: true,
      status: "paid",
      failureReason: null,
      canRetry: false,
    });
  });

  it("keeps a pending payment pending and offers a retry", async () => {
    const state = await getCheckoutState("RQ-M-1", "c1");

    expect(state.payment).toMatchObject({
      initialized: true,
      status: "pending",
      canRetry: true,
    });
  });

  it("reports a failed attempt with the provider reason", async () => {
    vi.mocked(CheckoutIntent.findOne).mockResolvedValue(
      intentDoc({
        status: "failed",
        authorizationUrl: null,
        failureReason: "The payment was declined.",
      }),
    );
    vi.mocked(Payment.find).mockReturnValue(
      leanChain([paymentDoc({ status: "failed" })]) as never,
    );

    const state = await getCheckoutState("RQ-M-1", "c1");

    expect(state.payment).toMatchObject({
      initialized: false,
      status: "failed",
      failureReason: "The payment was declined.",
      canRetry: true,
    });
  });

  it("treats a successful payment row as paid even when the intent lags", async () => {
    vi.mocked(Payment.find).mockReturnValue(
      leanChain([paymentDoc({ status: "successful" })]) as never,
    );

    const state = await getCheckoutState("RQ-M-1", "c1");

    expect(state.payment.status).toBe("paid");
  });

  it("falls back to stored totals when the snapshot is missing", async () => {
    vi.mocked(CheckoutIntent.findOne).mockResolvedValue(
      intentDoc({ snapshot: null }),
    );

    const state = await getCheckoutState("RQ-M-1", "c1");

    expect(state.groups).toEqual([]);
    expect(state.address).toBeNull();
    expect(state.summary).toEqual({
      currency: "NGN",
      itemCount: 0,
      subtotal: 53500,
      deliveryFee: 1500,
      serviceFee: 0,
      discount: 0,
      total: 55000,
    });
  });

  it("hides another customer's checkout", async () => {
    vi.mocked(CheckoutIntent.findOne).mockResolvedValue(null);

    await expect(getCheckoutState("RQ-M-404", "c2")).rejects.toMatchObject({
      statusCode: 404,
      message: "Checkout not found",
    });

    expect(CheckoutIntent.findOne).toHaveBeenCalledWith({
      masterOrderNumber: "RQ-M-404",
      customer: "c2",
    });
  });
});
