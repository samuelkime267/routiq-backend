import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/models/product.model", () => ({ default: { find: vi.fn() } }));
vi.mock("@/models/store.model", () => ({ default: { find: vi.fn() } }));
vi.mock("@/models/address.model", () => ({ default: { findOne: vi.fn() } }));
vi.mock("@/services/marketplace/visibility", () => ({
  PUBLIC_PRODUCT_STATUS: "approved",
  PUBLIC_PRODUCT_PUBLICATION_STATUS: "published",
  resolvePublicScope: vi.fn(),
}));
vi.mock("@/services/shipments/provider", () => ({
  isShipbubbleConfigured: false,
  validateShipbubbleAddress: vi.fn(),
  fetchShipbubbleRates: vi.fn(),
}));
vi.mock("@/services/delivery", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/delivery")>();

  return { ...actual, quoteStoreDelivery: vi.fn(actual.quoteStoreDelivery) };
});

import Address from "@/models/address.model";
import Product from "@/models/product.model";
import Store from "@/models/store.model";
import { quoteStoreDelivery } from "@/services/delivery";
import {
  checkoutFingerprint,
  normaliseItems,
  buildCheckoutQuote,
} from "@/services/checkout/quote";
import { resolvePublicScope } from "@/services/marketplace/visibility";
import { DEFAULT_SETTINGS, type PlatformSettingsView } from "@/services/settings";

const settings = {
  ...DEFAULT_SETTINGS,
  shipping: {
    ...DEFAULT_SETTINGS.shipping,
    defaultDeliveryFee: 1500,
    freeShippingThreshold: null,
    estimatedDeliveryDays: 3,
  },
} as PlatformSettingsView;

const product = (overrides: Record<string, unknown> = {}) => ({
  _id: "p1",
  name: "4K Streaming Stick",
  images: ["https://cdn.example.com/stream.jpg"],
  price: 53500,
  compareAtPrice: 70000,
  category: "Electronics",
  stock: 5,
  status: "approved",
  publicationStatus: "published",
  store: "s1",
  vendor: "v1",
  ...overrides,
});

const store = (overrides: Record<string, unknown> = {}) => ({
  _id: "s1",
  name: "TechHub Lagos",
  slug: "techhub-lagos",
  logo: null,
  owner: "v1",
  email: "store@example.com",
  phoneNumber: "08012345678",
  address: {
    street: "12 Admiralty Way",
    city: "Lekki",
    lga: "Eti-Osa",
    state: "Lagos",
    country: "Nigeria",
  },
  ...overrides,
});

const address = (overrides: Record<string, unknown> = {}) => ({
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
  ...overrides,
});

const quote = (
  items: Array<{ productId: string; quantity: number; expectedUnitPrice?: number }>,
  options: { addressId?: string | null; deliverySelections?: Record<string, string> } = {},
) =>
  buildCheckoutQuote(
    {
      customerId: "c1",
      items,
      addressId: options.addressId === undefined ? "a1" : options.addressId,
      deliverySelections: options.deliverySelections,
    },
    { settings, now: new Date("2026-11-14T09:00:00.000Z") },
  );

describe("checkout quote", () => {
  beforeEach(() => {
    vi.mocked(Product.find).mockResolvedValue([product()] as never);
    vi.mocked(Store.find).mockResolvedValue([store()] as never);
    vi.mocked(Address.findOne).mockResolvedValue(address() as never);
    vi.mocked(resolvePublicScope).mockResolvedValue({
      vendorIds: ["v1", "v2"],
      storeIds: ["s1", "s2"],
    });
  });

  it("prices a single-store cart from the catalogue, not the client", async () => {
    const result = await quote([
      { productId: "p1", quantity: 1, expectedUnitPrice: 53500 },
    ]);

    expect(result.blocking).toBe(false);
    expect(result.issues).toEqual([]);
    expect(result.groups).toHaveLength(1);

    const [group] = result.groups;

    expect(group.store).toMatchObject({
      _id: "s1",
      name: "TechHub Lagos",
      city: "Lekki",
      state: "Lagos",
    });
    expect(group.vendor).toBe("v1");
    expect(group.items[0]).toMatchObject({
      product: "p1",
      quantity: 1,
      unitPrice: 53500,
      lineTotal: 53500,
      priceChanged: false,
    });
    expect(group.subtotal).toBe(53500);
    expect(group.deliveryFee).toBe(1500);
    expect(group.total).toBe(55000);
    expect(group.selectedDelivery).toMatchObject({
      provider: "platform",
      fee: 1500,
    });
    expect(group.estimatedDeliveryAt).toBe("2026-11-17T09:00:00.000Z");

    expect(result.summary).toMatchObject({
      currency: "NGN",
      itemCount: 1,
      subtotal: 53500,
      deliveryFee: 1500,
      serviceFee: 0,
      discount: 0,
      total: 55000,
    });
    expect(result.deliveryAvailable).toBe(true);
  });

  it("keeps one fulfilment group per store and sums the master total", async () => {
    vi.mocked(Product.find).mockResolvedValue([
      product(),
      product({
        _id: "p2",
        name: "Honey 1L",
        price: 9000,
        compareAtPrice: null,
        category: "Groceries",
        store: "s2",
        vendor: "v2",
      }),
    ] as never);
    vi.mocked(Store.find).mockResolvedValue([
      store(),
      store({
        _id: "s2",
        name: "Green Basket Grocers",
        slug: "green-basket",
        owner: "v2",
        address: {
          street: "9 Market Road",
          city: "Ikeja",
          lga: "Ikeja",
          state: "Lagos",
          country: "Nigeria",
        },
      }),
    ] as never);

    const result = await quote([
      { productId: "p1", quantity: 1 },
      { productId: "p2", quantity: 2 },
    ]);

    expect(result.groups).toHaveLength(2);
    expect(result.groups.map((group) => group.store.name)).toEqual([
      "Green Basket Grocers",
      "TechHub Lagos",
    ]);

    const green = result.groups[0];
    expect(green.items[0]).toMatchObject({ lineTotal: 18000 });
    expect(green.subtotal).toBe(18000);
    expect(green.deliveryFee).toBe(1500);
    expect(green.total).toBe(19500);

    expect(result.summary).toMatchObject({
      itemCount: 3,
      subtotal: 71500,
      deliveryFee: 3000,
      total: 74500,
    });
    expect(result.blocking).toBe(false);
  });

  it("charges the current price and reports a price change instead of trusting the client", async () => {
    vi.mocked(Product.find).mockResolvedValue([
      product({ price: 56000 }),
    ] as never);

    const result = await quote([
      { productId: "p1", quantity: 1, expectedUnitPrice: 53500 },
    ]);

    expect(result.blocking).toBe(false);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "price_changed",
        expectedUnitPrice: 53500,
        currentUnitPrice: 56000,
      }),
    ]);
    expect(result.groups[0].items[0].priceChanged).toBe(true);
    expect(result.summary.subtotal).toBe(56000);
    expect(result.summary.total).toBe(57500);
  });

  it("blocks a cart whose stock no longer covers the quantity", async () => {
    vi.mocked(Product.find).mockResolvedValue([product({ stock: 1 })] as never);

    const result = await quote([{ productId: "p1", quantity: 2 }]);

    expect(result.blocking).toBe(true);
    expect(result.groups).toEqual([]);
    expect(result.summary.total).toBe(0);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "insufficient_stock",
        productId: "p1",
        availableStock: 1,
      }),
    ]);
  });

  it("blocks unavailable products and stores that are no longer public", async () => {
    vi.mocked(Product.find).mockResolvedValue([
      product({ _id: "p1", status: "pending" }),
      product({ _id: "p2", name: "Hidden Item", store: "s9", vendor: "v9" }),
    ] as never);

    const result = await quote([
      { productId: "p1", quantity: 1 },
      { productId: "p2", quantity: 1 },
      { productId: "gone", quantity: 1 },
    ]);

    expect(result.blocking).toBe(true);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "product_unavailable",
      "store_unavailable",
      "product_unavailable",
    ]);
    expect(result.groups).toEqual([]);
  });

  it("rejects an address that does not belong to the customer without inventing a fee", async () => {
    vi.mocked(Address.findOne).mockResolvedValue(null as never);

    const result = await quote([{ productId: "p1", quantity: 1 }]);

    expect(result.blocking).toBe(true);
    expect(result.address).toBeNull();
    expect(result.issues.map((issue) => issue.code)).toEqual(["address_invalid"]);
    expect(result.groups[0].delivery.available).toBe(false);
    expect(result.groups[0].delivery.options).toEqual([]);
    expect(result.groups[0].deliveryFee).toBe(0);
    expect(result.groups[0].total).toBe(53500);
    expect(result.deliveryAvailable).toBe(false);
  });

  it("surfaces an unserviceable location as blocking with no fee", async () => {
    vi.mocked(quoteStoreDelivery).mockResolvedValueOnce({
      available: false,
      options: [],
      selectedOptionId: null,
      message: "Shipbubble has no delivery option for this address.",
    });

    const result = await quote([{ productId: "p1", quantity: 1 }]);

    expect(result.blocking).toBe(true);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "delivery_unavailable",
        message: "Shipbubble has no delivery option for this address.",
      }),
    ]);
    expect(result.groups[0].deliveryFee).toBe(0);
    expect(result.groups[0].total).toBe(53500);
    expect(result.deliveryAvailable).toBe(false);
  });

  it("honours a requested delivery option and falls back for unknown ids", async () => {
    const requested = await quote([{ productId: "p1", quantity: 1 }], {
      deliverySelections: { s1: "platform:standard" },
    });
    expect(requested.groups[0].selectedDelivery?.id).toBe("platform:standard");

    const unknown = await quote([{ productId: "p1", quantity: 1 }], {
      deliverySelections: { s1: "shipbubble:does-not-exist" },
    });
    expect(unknown.groups[0].selectedDelivery?.id).toBe("platform:standard");
    expect(unknown.blocking).toBe(false);
  });
});

describe("checkout fingerprinting", () => {
  it("merges duplicate product rows before pricing", () => {
    expect(
      normaliseItems([
        { productId: "p1", quantity: 1 },
        { productId: "p1", quantity: 2 },
      ]),
    ).toEqual([
      { productId: "p1", quantity: 3, expectedUnitPrice: null },
    ]);
  });

  it("is stable across item order and delivery selection order", () => {
    const first = checkoutFingerprint(
      [
        { productId: "p1", quantity: 1 },
        { productId: "p2", quantity: 2 },
      ],
      "a1",
      { s2: "rate-b", s1: "rate-a" },
    );
    const second = checkoutFingerprint(
      [
        { productId: "p2", quantity: 2 },
        { productId: "p1", quantity: 1 },
      ],
      "a1",
      { s1: "rate-a", s2: "rate-b" },
    );

    expect(first).toBe(second);
    expect(first).not.toBe(
      checkoutFingerprint([{ productId: "p1", quantity: 2 }], "a1"),
    );
  });
});
