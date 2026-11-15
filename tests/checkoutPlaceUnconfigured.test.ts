import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/models/checkoutIntent.model", () => ({
  default: { findOne: vi.fn(), create: vi.fn(), deleteOne: vi.fn() },
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
  default: { create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
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
vi.mock("@/services/notifications/notify", () => ({ notifyVendor: vi.fn() }));
vi.mock("@/lib/activity", () => ({ recordActivity: vi.fn() }));
vi.mock("@/services/payments/apply", () => ({
  applyPaymentSuccess: vi.fn(),
  resetCheckoutPayment: vi.fn(),
}));
vi.mock("@/services/payments/paystack", () => ({
  isPaystackConfigured: false,
  initializePaystackTransaction: vi.fn(),
  verifyPaystackTransaction: vi.fn(),
  verifyPaystackSignature: vi.fn(),
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

import CheckoutIntent from "@/models/checkoutIntent.model";
import Address from "@/models/address.model";
import Product from "@/models/product.model";
import { initializePaystackTransaction } from "@/services/payments/paystack";
import { buildCheckoutQuote } from "@/services/checkout/quote";
import { placeCheckout } from "@/services/checkout/place";

const customer = {
  _id: "c1",
  name: "Ada Customer",
  email: "ada@example.com",
} as never;

describe("placeCheckout without a payment provider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses to create orders when online payment is not configured", async () => {
    vi.mocked(CheckoutIntent.findOne).mockResolvedValue(null);

    const result = await placeCheckout({
      customer,
      key: "key-1",
      items: [{ productId: "p1", quantity: 1 }],
      addressId: "a1",
    });

    expect(result).toEqual({
      kind: "payment_unavailable",
      message:
        "Online payment is not configured yet, so orders cannot be placed. Please try again later.",
    });
    expect(buildCheckoutQuote).not.toHaveBeenCalled();
    expect(CheckoutIntent.create).not.toHaveBeenCalled();
    expect(Product.updateOne).not.toHaveBeenCalled();
    expect(Address.updateOne).not.toHaveBeenCalled();
    expect(initializePaystackTransaction).not.toHaveBeenCalled();
  });
});
