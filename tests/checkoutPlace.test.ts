import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/models/checkoutIntent.model", () => ({
  default: {
    findOne: vi.fn(),
    create: vi.fn(),
    deleteOne: vi.fn(),
  },
}));
vi.mock("@/models/order.model", () => ({
  default: {
    create: vi.fn(),
    find: vi.fn(),
    deleteMany: vi.fn(),
    exists: vi.fn(),
  },
}));
vi.mock("@/models/payment.model", () => ({
  default: {
    create: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
}));
vi.mock("@/models/product.model", () => ({
  default: { updateOne: vi.fn() },
}));
vi.mock("@/models/address.model", () => ({
  default: { updateOne: vi.fn() },
}));
vi.mock("@/models/user.model", () => ({
  default: { findById: vi.fn() },
}));
vi.mock("@/services/notifications/notify", () => ({
  notifyVendor: vi.fn(),
}));
vi.mock("@/lib/activity", () => ({
  recordActivity: vi.fn(),
}));
vi.mock("@/services/payments/apply", () => ({
  applyPaymentSuccess: vi.fn(),
  resetCheckoutPayment: vi.fn(),
}));
vi.mock("@/services/payments/paystack", () => ({
  isPaystackConfigured: true,
  initializePaystackTransaction: vi.fn(),
  verifyPaystackTransaction: vi.fn(),
  verifyPaystackSignature: vi.fn(),
}));
vi.mock("@/services/checkout/numbers", () => ({
  generateOrderNumbers: vi.fn(),
  generatePaymentReferences: vi.fn(),
  generateProviderReference: vi.fn(() => "PROVIDER-REF"),
}));
vi.mock("@/services/checkout/quote", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/services/checkout/quote")>();

  return { ...actual, buildCheckoutQuote: vi.fn() };
});
vi.mock("@/config/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/config/env")>();

  return { ...actual, MARKETPLACE_URL: "http://localhost:3000" };
});

import Address from "@/models/address.model";
import CheckoutIntent from "@/models/checkoutIntent.model";
import Order from "@/models/order.model";
import Payment from "@/models/payment.model";
import Product from "@/models/product.model";
import User from "@/models/user.model";
import { notifyVendor } from "@/services/notifications/notify";
import { recordActivity } from "@/lib/activity";
import {
  applyPaymentSuccess,
  resetCheckoutPayment,
} from "@/services/payments/apply";
import { initializePaystackTransaction } from "@/services/payments/paystack";
import {
  buildCheckoutQuote,
  checkoutFingerprint,
  type CheckoutGroup,
  type CheckoutQuote,
} from "@/services/checkout/quote";
import {
  generateOrderNumbers,
  generatePaymentReferences,
} from "@/services/checkout/numbers";
import { placeCheckout, retryCheckoutPayment } from "@/services/checkout/place";

const customer = {
  _id: "c1",
  name: "Ada Customer",
  email: "ada@example.com",
} as never;

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

const line = (overrides: Record<string, unknown> = {}) => ({
  product: "p1",
  name: "4K Streaming Stick",
  quantity: 1,
  unitPrice: 53500,
  lineTotal: 53500,
  priceChanged: false,
  ...overrides,
});

const group = (overrides: Partial<CheckoutGroup> = {}): CheckoutGroup =>
  ({
    store: {
      _id: "s1",
      name: "TechHub Lagos",
      slug: "techhub-lagos",
      logo: null,
      city: "Lekki",
      state: "Lagos",
    },
    vendor: "v1",
    items: [line()],
    subtotal: 53500,
    delivery: {
      available: true,
      options: [],
      selectedOptionId: null,
      message: null,
    },
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
    ...overrides,
  }) as CheckoutGroup;

const secondGroup = (): CheckoutGroup =>
  group({
    store: {
      _id: "s2",
      name: "Green Basket Grocers",
      slug: "green-basket",
      logo: null,
      city: "Ikeja",
      state: "Lagos",
    },
    vendor: "v2",
    items: [
      line({
        product: "p2",
        name: "Honey 1L",
        quantity: 2,
        unitPrice: 9000,
        lineTotal: 18000,
      }),
    ],
    subtotal: 18000,
    total: 19500,
  });

const quoteOf = (groups: CheckoutGroup[]): CheckoutQuote => {
  const subtotal = groups.reduce((sum, row) => sum + row.subtotal, 0);
  const deliveryFee = groups.reduce((sum, row) => sum + row.deliveryFee, 0);
  const itemCount = groups.reduce(
    (sum, row) => sum + row.items.reduce((n, item) => n + item.quantity, 0),
    0,
  );

  return {
    groups,
    summary: {
      currency: "NGN",
      itemCount,
      subtotal,
      deliveryFee,
      serviceFee: 0,
      discount: 0,
      total: subtotal + deliveryFee,
    },
    issues: [],
    address,
    deliveryAvailable: true,
    blocking: false,
    fingerprint: "fp",
  } as CheckoutQuote;
};

const makeIntent = (overrides: Record<string, unknown> = {}) =>
  ({
    _id: "i1",
    customer: "c1",
    key: "key-1",
    status: "creating",
    masterOrderNumber: "RQ-M-1",
    orders: [] as unknown[],
    payments: [] as unknown[],
    subtotal: 0,
    deliveryFee: 0,
    serviceFee: 0,
    discount: 0,
    total: 0,
    snapshot: null,
    provider: "paystack",
    providerReference: "PROVIDER-REF",
    authorizationUrl: null,
    accessCode: null,
    failureReason: null,
    save: vi.fn(async () => undefined),
    ...overrides,
  }) as never;

const leanChain = (rows: unknown[]) => ({
  sort: () => ({ lean: async () => rows }),
});

const orderRows = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    _id: `o${index + 1}`,
    orderNumber: `RQ-${index + 1}`,
    store: index === 0 ? "s1" : "s2",
    vendor: index === 0 ? "v1" : "v2",
    total: index === 0 ? 55000 : 19500,
    status: "pending",
    paymentStatus: "pending",
  }));

const input = (overrides: Record<string, unknown> = {}) => ({
  customer,
  key: "key-1",
  items: [{ productId: "p1", quantity: 1, expectedUnitPrice: 53500 }],
  addressId: "a1",
  ...overrides,
});

describe("placeCheckout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Product.updateOne).mockResolvedValue({ modifiedCount: 1 } as never);
    vi.mocked(Address.updateOne).mockResolvedValue({} as never);
    vi.mocked(Payment.updateMany).mockResolvedValue({} as never);
    vi.mocked(CheckoutIntent.deleteOne).mockResolvedValue({} as never);
    vi.mocked(Order.deleteMany).mockResolvedValue({} as never);
    vi.mocked(Payment.deleteMany).mockResolvedValue({} as never);
    vi.mocked(resetCheckoutPayment).mockResolvedValue(undefined as never);
    vi.mocked(applyPaymentSuccess).mockResolvedValue(undefined as never);
    vi.mocked(recordActivity).mockResolvedValue(undefined as never);
    vi.mocked(notifyVendor).mockResolvedValue(undefined as never);
    vi.mocked(initializePaystackTransaction).mockResolvedValue({
      reference: "PROVIDER-REF",
      authorizationUrl: "https://checkout.paystack.test/abc",
      accessCode: "access-1",
    } as never);
    vi.mocked(generateOrderNumbers).mockImplementation((async (count: number) => ({
      masterOrderNumber: "RQ-M-1",
      orders: Array.from({ length: count }, (_, index) => ({
        orderNumber: `RQ-${index + 1}`,
        subOrderNumber: `RQ-M-1-${String.fromCharCode(65 + index)}`,
      })),
    })) as never);
    vi.mocked(generatePaymentReferences).mockImplementation((async (count: number) =>
      Array.from({ length: count }, (_, index) => `PAY-${index + 1}`)) as never);
    vi.mocked(Order.create).mockImplementation((async (rows: Record<string, unknown>[]) =>
      rows.map((row, index) => ({
        ...row,
        _id: `o${index + 1}`,
        store: { _id: row.store, name: "Store" },
        vendor: row.vendor,
      }))) as never);
    vi.mocked(Payment.create).mockImplementation((async (rows: Record<string, unknown>[]) =>
      rows.map((row, index) => ({
        ...row,
        _id: `pay${index + 1}`,
      }))) as never);
  });

  it("places one order and one payment for a single-store cart", async () => {
    const cart = quoteOf([group()]);
    vi.mocked(CheckoutIntent.findOne).mockResolvedValue(null);
    vi.mocked(buildCheckoutQuote).mockResolvedValue(cart);

    const intent = makeIntent({
      subtotal: cart.summary.subtotal,
      deliveryFee: cart.summary.deliveryFee,
      total: cart.summary.total,
      snapshot: { groups: cart.groups, summary: cart.summary, address },
    });
    vi.mocked(CheckoutIntent.create).mockResolvedValue(intent);
    vi.mocked(Order.find).mockReturnValue(
      leanChain(orderRows(1)) as never,
    );

    const result = await placeCheckout(input(), {
      now: new Date("2026-11-14T09:00:00.000Z"),
    });

    expect(result.kind).toBe("placed");
    if (result.kind !== "placed") return;

    expect(result.resumed).toBe(false);
    expect(result.masterOrderNumber).toBe("RQ-M-1");
    expect(result.summary.total).toBe(55000);
    expect(result.payment).toMatchObject({
      provider: "paystack",
      initialized: true,
      reference: "PROVIDER-REF",
      authorizationUrl: "https://checkout.paystack.test/abc",
      status: "pending",
    });

    expect(Product.updateOne).toHaveBeenCalledWith(
      {
        _id: "p1",
        stock: { $gte: 1 },
        status: "approved",
        publicationStatus: "published",
      },
      { $inc: { stock: -1 } },
    );

    const orders = vi.mocked(Order.create).mock.calls[0][0] as unknown as Array<
      Record<string, unknown>
    >;
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      orderNumber: "RQ-1",
      masterOrderNumber: "RQ-M-1",
      subOrderNumber: "RQ-M-1-A",
      store: "s1",
      vendor: "v1",
      subtotal: 53500,
      shippingFee: 1500,
      total: 55000,
      status: "pending",
      paymentStatus: "pending",
      shippingCity: "Lekki",
      shippingState: "Lagos",
      shippingAddress: expect.objectContaining({
        recipientName: "Ada Checkout",
        street: "4 Freedom Way",
      }),
    });
    expect(orders[0].placedAt).toEqual(new Date("2026-11-14T09:00:00.000Z"));

    const payments = vi.mocked(Payment.create).mock.calls[0][0] as unknown as Array<
      Record<string, unknown>
    >;
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({
      reference: "PAY-1",
      order: "o1",
      customer: "c1",
      amount: 55000,
      currency: "NGN",
      status: "pending",
      provider: "paystack",
      providerReference: "PROVIDER-REF",
    });

    expect(initializePaystackTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "ada@example.com",
        amount: 55000,
        reference: "PROVIDER-REF",
        callbackUrl:
          "http://localhost:3000/checkout/confirmation/RQ-M-1",
      }),
      undefined,
    );
    expect(resetCheckoutPayment).toHaveBeenCalledWith(intent, "PROVIDER-REF");
    expect(intent.status).toBe("initialized");
    expect(intent.authorizationUrl).toBe(
      "https://checkout.paystack.test/abc",
    );
    expect(Address.updateOne).toHaveBeenCalledWith(
      { _id: "a1", customer: "c1" },
      { $set: { lastUsedAt: new Date("2026-11-14T09:00:00.000Z") } },
    );
    expect(recordActivity).toHaveBeenCalledTimes(1);
    expect(notifyVendor).toHaveBeenCalledTimes(1);
  });

  it("creates two sub-orders that share one provider transaction", async () => {
    const cart = quoteOf([secondGroup(), group()]);
    vi.mocked(CheckoutIntent.findOne).mockResolvedValue(null);
    vi.mocked(buildCheckoutQuote).mockResolvedValue(cart);

    const intent = makeIntent({
      total: cart.summary.total,
      snapshot: { groups: cart.groups, summary: cart.summary, address },
    });
    vi.mocked(CheckoutIntent.create).mockResolvedValue(intent);
    vi.mocked(Order.find).mockReturnValue(leanChain(orderRows(2)) as never);

    const result = await placeCheckout(
      input({
        items: [
          { productId: "p2", quantity: 2 },
          { productId: "p1", quantity: 1 },
        ],
      }),
    );

    expect(result.kind).toBe("placed");
    if (result.kind !== "placed") return;

    expect(result.summary).toMatchObject({
      itemCount: 3,
      subtotal: 71500,
      deliveryFee: 3000,
      total: 74500,
    });

    const orders = vi.mocked(Order.create).mock.calls[0][0] as unknown as Array<
      Record<string, unknown>
    >;
    expect(orders).toHaveLength(2);
    expect(orders.map((row) => row.subOrderNumber)).toEqual([
      "RQ-M-1-A",
      "RQ-M-1-B",
    ]);
    expect(new Set(orders.map((row) => row.masterOrderNumber))).toEqual(
      new Set(["RQ-M-1"]),
    );

    const payments = vi.mocked(Payment.create).mock.calls[0][0] as unknown as Array<
      Record<string, unknown>
    >;
    expect(payments).toHaveLength(2);
    expect(payments[0].amount).toBe(19500);
    expect(payments[1].amount).toBe(55000);
    expect(new Set(payments.map((row) => row.providerReference))).toEqual(
      new Set(["PROVIDER-REF"]),
    );

    expect(initializePaystackTransaction).toHaveBeenCalledTimes(1);
    expect(initializePaystackTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 74500 }),
      undefined,
    );
  });

  it("rolls back earlier stock when a product sells out during placement", async () => {
    const cart = quoteOf([secondGroup(), group()]);
    vi.mocked(CheckoutIntent.findOne).mockResolvedValue(null);
    vi.mocked(buildCheckoutQuote).mockResolvedValue(cart);

    const intent = makeIntent({
      total: cart.summary.total,
      snapshot: { groups: cart.groups, summary: cart.summary, address },
    });
    vi.mocked(CheckoutIntent.create).mockResolvedValue(intent);
    vi.mocked(Product.updateOne)
      .mockResolvedValueOnce({ modifiedCount: 1 } as never)
      .mockResolvedValueOnce({ modifiedCount: 0 } as never)
      .mockResolvedValue({ modifiedCount: 1 } as never);

    const result = await placeCheckout(
      input({
        items: [
          { productId: "p2", quantity: 2 },
          { productId: "p1", quantity: 1 },
        ],
      }),
    );

    expect(result.kind).toBe("blocked");
    if (result.kind !== "blocked") return;

    expect(result.message).toContain("4K Streaming Stick");
    expect(result.quote.blocking).toBe(true);
    expect(result.quote.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "insufficient_stock",
          productId: "p1",
        }),
      ]),
    );

    expect(Product.updateOne).toHaveBeenLastCalledWith(
      { _id: "p2" },
      { $inc: { stock: 2 } },
    );
    expect(Order.create).not.toHaveBeenCalled();
    expect(CheckoutIntent.deleteOne).toHaveBeenCalledWith({ _id: "i1" });
  });

  it("resumes an existing intent instead of charging twice", async () => {
    const cart = quoteOf([group()]);
    const fingerprint = checkoutFingerprint(
      [{ productId: "p1", quantity: 1 }],
      "a1",
      {},
    );
    const intent = makeIntent({
      status: "initialized",
      fingerprint,
      authorizationUrl: "https://checkout.paystack.test/existing",
      accessCode: "existing-code",
      orders: ["o1"],
      payments: ["pay1"],
      total: 55000,
      snapshot: { groups: cart.groups, summary: cart.summary, address },
    });

    vi.mocked(CheckoutIntent.findOne).mockResolvedValue(intent);
    vi.mocked(Order.find).mockReturnValue(leanChain(orderRows(1)) as never);

    const result = await placeCheckout(input());

    expect(result.kind).toBe("placed");
    if (result.kind !== "placed") return;

    expect(result.resumed).toBe(true);
    expect(result.masterOrderNumber).toBe("RQ-M-1");
    expect(result.payment).toMatchObject({
      initialized: true,
      reference: "PROVIDER-REF",
      authorizationUrl: "https://checkout.paystack.test/existing",
      status: "pending",
    });

    expect(buildCheckoutQuote).not.toHaveBeenCalled();
    expect(CheckoutIntent.create).not.toHaveBeenCalled();
    expect(Product.updateOne).not.toHaveBeenCalled();
    expect(Order.create).not.toHaveBeenCalled();
    expect(Payment.create).not.toHaveBeenCalled();
    expect(initializePaystackTransaction).not.toHaveBeenCalled();
  });

  it("rejects a reused idempotency key with a different cart", async () => {
    const cart = quoteOf([group()]);
    const intent = makeIntent({
      fingerprint: "different-fingerprint",
      snapshot: { groups: cart.groups, summary: cart.summary, address },
    });

    vi.mocked(CheckoutIntent.findOne).mockResolvedValue(intent);

    const result = await placeCheckout(input());

    expect(result.kind).toBe("price_changed");
    if (result.kind !== "price_changed") return;

    expect(result.message).toContain("different cart");
    expect(CheckoutIntent.create).not.toHaveBeenCalled();
  });

  it("refuses to place an order when the verified total differs from the client total", async () => {
    const cart = quoteOf([group()]);
    vi.mocked(CheckoutIntent.findOne).mockResolvedValue(null);
    vi.mocked(buildCheckoutQuote).mockResolvedValue(cart);

    const result = await placeCheckout(input({ expectedTotal: 50000 }));

    expect(result.kind).toBe("price_changed");
    if (result.kind !== "price_changed") return;

    expect(result.message).toContain("total changed");
    expect(result.quote.summary.total).toBe(55000);
    expect(CheckoutIntent.create).not.toHaveBeenCalled();
    expect(Product.updateOne).not.toHaveBeenCalled();
  });

  it("keeps the orders when the payment provider cannot be started", async () => {
    const cart = quoteOf([group()]);
    vi.mocked(CheckoutIntent.findOne).mockResolvedValue(null);
    vi.mocked(buildCheckoutQuote).mockResolvedValue(cart);

    const intent = makeIntent({
      total: cart.summary.total,
      snapshot: { groups: cart.groups, summary: cart.summary, address },
    });
    vi.mocked(CheckoutIntent.create).mockResolvedValue(intent);
    vi.mocked(Order.find).mockReturnValue(leanChain(orderRows(1)) as never);
    vi.mocked(initializePaystackTransaction).mockRejectedValue(
      new Error("provider unreachable"),
    );

    const result = await placeCheckout(input());

    expect(result.kind).toBe("placed");
    if (result.kind !== "placed") return;

    expect(result.payment).toMatchObject({
      provider: "paystack",
      initialized: false,
      reference: "PROVIDER-REF",
      authorizationUrl: null,
      status: "failed",
      message: "provider unreachable",
    });
    expect(intent.status).toBe("failed");
    expect(intent.failureReason).toBe("provider unreachable");
    expect(Order.create).toHaveBeenCalledTimes(1);
    expect(Order.deleteMany).not.toHaveBeenCalled();
    expect(CheckoutIntent.deleteOne).not.toHaveBeenCalled();
  });

  it("marks a zero-value checkout paid without opening the provider", async () => {
    const freeGroup = group({
      subtotal: 0,
      deliveryFee: 0,
      total: 0,
      items: [],
      selectedDelivery: null,
      estimatedDeliveryAt: null,
    });
    const cart = quoteOf([freeGroup]);
    vi.mocked(CheckoutIntent.findOne).mockResolvedValue(null);
    vi.mocked(buildCheckoutQuote).mockResolvedValue(cart);

    const intent = makeIntent({
      total: 0,
      snapshot: { groups: cart.groups, summary: cart.summary, address },
    });
    vi.mocked(CheckoutIntent.create).mockResolvedValue(intent);
    vi.mocked(Order.find).mockReturnValue(leanChain(orderRows(1)) as never);

    const result = await placeCheckout(input());

    expect(result.kind).toBe("placed");
    if (result.kind !== "placed") return;

    expect(result.payment).toMatchObject({
      provider: null,
      initialized: true,
      status: "paid",
      message: "This order did not require a payment.",
    });
    expect(initializePaystackTransaction).not.toHaveBeenCalled();
    expect(applyPaymentSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        masterOrderNumber: "RQ-M-1",
        providerReference: "PROVIDER-REF",
        channel: "wallet",
      }),
    );
  });

  it("re-initialises payment when resuming a failed checkout", async () => {
    const cart = quoteOf([group()]);
    const fingerprint = checkoutFingerprint(
      [{ productId: "p1", quantity: 1 }],
      "a1",
      {},
    );
    const intent = makeIntent({
      status: "failed",
      fingerprint,
      failureReason: "provider unreachable",
      orders: ["o1"],
      payments: ["pay1"],
      total: 55000,
      snapshot: { groups: cart.groups, summary: cart.summary, address },
    });

    vi.mocked(CheckoutIntent.findOne).mockResolvedValue(intent);
    vi.mocked(Order.find).mockReturnValue(leanChain(orderRows(1)) as never);

    const result = await placeCheckout(input());

    expect(result.kind).toBe("placed");
    if (result.kind !== "placed") return;

    expect(result.resumed).toBe(true);
    expect(result.payment.status).toBe("pending");
    expect(result.payment.authorizationUrl).toBe(
      "https://checkout.paystack.test/abc",
    );
    expect(resetCheckoutPayment).toHaveBeenCalledWith(intent, "PROVIDER-REF");
    expect(Payment.updateMany).toHaveBeenCalled();
    expect(intent.status).toBe("initialized");
    expect(intent.failureReason).toBeNull();
    expect(Order.create).not.toHaveBeenCalled();
  });

  it("rolls back stock and orders when order persistence fails", async () => {
    const cart = quoteOf([group()]);
    vi.mocked(CheckoutIntent.findOne).mockResolvedValue(null);
    vi.mocked(buildCheckoutQuote).mockResolvedValue(cart);

    const intent = makeIntent({
      total: cart.summary.total,
      snapshot: { groups: cart.groups, summary: cart.summary, address },
    });
    vi.mocked(CheckoutIntent.create).mockResolvedValue(intent);
    vi.mocked(Order.create).mockResolvedValue([
      { _id: "o1", store: "s1", vendor: "v1", total: 55000 },
    ] as never);
    vi.mocked(Payment.create).mockRejectedValue(new Error("write failed"));

    await expect(placeCheckout(input())).rejects.toThrow("write failed");

    expect(Product.updateOne).toHaveBeenLastCalledWith(
      { _id: "p1" },
      { $inc: { stock: 1 } },
    );
    expect(Order.deleteMany).toHaveBeenCalledWith({ _id: { $in: ["o1"] } });
    expect(CheckoutIntent.deleteOne).toHaveBeenCalledWith({ _id: "i1" });
    expect(initializePaystackTransaction).not.toHaveBeenCalled();
  });
});

describe("retryCheckoutPayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Payment.updateMany).mockResolvedValue({} as never);
    vi.mocked(resetCheckoutPayment).mockResolvedValue(undefined as never);
    vi.mocked(initializePaystackTransaction).mockResolvedValue({
      reference: "PROVIDER-REF",
      authorizationUrl: "https://checkout.paystack.test/retry",
      accessCode: "access-2",
    } as never);
  });

  it("starts a fresh provider transaction for a saved checkout", async () => {
    const cart = quoteOf([group()]);
    const intent = makeIntent({
      status: "failed",
      orders: ["o1"],
      payments: ["pay1"],
      total: 55000,
      snapshot: { groups: cart.groups, summary: cart.summary, address },
    });

    vi.mocked(CheckoutIntent.findOne).mockResolvedValue(intent);
    vi.mocked(User.findById).mockResolvedValue(customer);
    vi.mocked(Order.find).mockReturnValue(leanChain(orderRows(1)) as never);

    const result = await retryCheckoutPayment(
      "RQ-M-1",
      "c1",
      { fetchImpl: undefined },
    );

    expect(result.kind).toBe("placed");
    if (result.kind !== "placed") return;

    expect(result.resumed).toBe(true);
    expect(result.summary.total).toBe(55000);
    expect(result.payment).toMatchObject({
      initialized: true,
      status: "pending",
      authorizationUrl: "https://checkout.paystack.test/retry",
    });
    expect(resetCheckoutPayment).toHaveBeenCalledWith(intent, "PROVIDER-REF");
    expect(initializePaystackTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 55000, reference: "PROVIDER-REF" }),
      undefined,
    );
    expect(intent.status).toBe("initialized");
  });

  it("returns the recorded state for a checkout that is already paid", async () => {
    const cart = quoteOf([group()]);
    const intent = makeIntent({
      status: "paid",
      orders: ["o1"],
      payments: ["pay1"],
      total: 55000,
      snapshot: { groups: cart.groups, summary: cart.summary, address },
    });

    vi.mocked(CheckoutIntent.findOne).mockResolvedValue(intent);
    vi.mocked(User.findById).mockResolvedValue(customer);
    vi.mocked(Order.find).mockReturnValue(leanChain(orderRows(1)) as never);

    const result = await retryCheckoutPayment("RQ-M-1", "c1");

    expect(result.kind).toBe("placed");
    if (result.kind !== "placed") return;

    expect(result.payment.status).toBe("paid");
    expect(result.payment.authorizationUrl).toBeNull();
    expect(initializePaystackTransaction).not.toHaveBeenCalled();
  });

  it("refuses to start a payment for another customer's checkout", async () => {
    vi.mocked(CheckoutIntent.findOne).mockResolvedValue(null);

    await expect(retryCheckoutPayment("RQ-M-9", "c2")).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(User.findById).not.toHaveBeenCalled();
    expect(initializePaystackTransaction).not.toHaveBeenCalled();
  });
});
