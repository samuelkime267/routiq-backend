import { describe, expect, it } from "vitest";
import {
  marketplaceSearchQuerySchema,
  publicCategoryQuerySchema,
  publicProductQuerySchema,
  publicStoreQuerySchema,
} from "@/schemas/marketplace";
import {
  categoryKey,
  mergeCategoryRows,
  publicProductBaseMatch,
  publicProductMatch,
  publicStoreMatch,
  toPublicProduct,
  toPublicStore,
} from "@/services/marketplace/visibility";
import { publicProductSort } from "@/services/marketplace/products";
import { publicStoreSort } from "@/services/marketplace/stores";

const scope = {
  vendorIds: ["vendor-1"],
  storeIds: ["store-1", "store-2"],
};

describe("public marketplace visibility predicates", () => {
  it("requires an approved, published product owned by an eligible vendor and store", () => {
    expect(publicProductMatch(scope)).toMatchObject({
      status: "approved",
      publicationStatus: "published",
      vendor: { $in: ["vendor-1"] },
      store: { $in: ["store-1", "store-2"] },
    });
  });

  it("keeps moderation requirements when extra filters are applied", () => {
    expect(
      publicProductMatch(scope, { category: "Groceries" }),
    ).toMatchObject({
      status: "approved",
      publicationStatus: "published",
      category: "Groceries",
    });
  });

  it("omits the store constraint only for lookups that already know the store", () => {
    const match = publicProductBaseMatch(scope, { store: "store-1" });

    expect(match).toMatchObject({
      status: "approved",
      publicationStatus: "published",
      vendor: { $in: ["vendor-1"] },
      store: "store-1",
    });
    expect(match.store).not.toEqual({ $in: scope.storeIds });
  });

  it("requires approved stores owned by an eligible vendor", () => {
    expect(publicStoreMatch(scope)).toMatchObject({
      status: "approved",
      owner: { $in: ["vendor-1"] },
    });
  });
});

describe("public product DTO", () => {
  const product = {
    _id: "product-1",
    name: "Golden Penny Semovita",
    slug: "golden-penny-semovita",
    description: "2kg pack",
    images: ["https://cdn.example/1.jpg", null],
    price: 4500,
    compareAtPrice: 6000,
    stock: 12,
    category: "Groceries",
    status: "approved",
    publicationStatus: "published",
    rejectionReason: null,
    sku: "SKU-1",
    vendor: { _id: "vendor-1", name: "Ada Foods", email: "secret@example.com" },
    store: {
      _id: "store-1",
      name: "Ada Market",
      slug: "ada-market",
      category: "Groceries",
      logo: null,
      status: "approved",
    },
    featured: true,
    createdAt: new Date("2026-01-02T10:00:00.000Z"),
    updatedAt: new Date("2026-01-03T10:00:00.000Z"),
  };

  it("maps the public contract and computes the discount", () => {
    const mapped = toPublicProduct(product);

    expect(mapped).toMatchObject({
      _id: "product-1",
      name: "Golden Penny Semovita",
      price: 4500,
      compareAtPrice: 6000,
      discountPercent: 25,
      currency: "NGN",
      stock: 12,
      inStock: true,
      featured: true,
      category: "Groceries",
      images: ["https://cdn.example/1.jpg"],
    });
    expect(mapped.store).toEqual({
      _id: "store-1",
      name: "Ada Market",
      slug: "ada-market",
      logo: null,
      category: "Groceries",
    });
    expect(mapped.vendor).toEqual({ _id: "vendor-1", name: "Ada Foods" });
  });

  it("drops moderation and internal fields from the response", () => {
    const mapped = toPublicProduct(product) as Record<string, unknown>;

    expect(mapped).not.toHaveProperty("status");
    expect(mapped).not.toHaveProperty("publicationStatus");
    expect(mapped).not.toHaveProperty("rejectionReason");
    expect(mapped).not.toHaveProperty("sku");
  });

  it("hides a compare-at price that is not an actual discount", () => {
    const mapped = toPublicProduct({
      ...product,
      compareAtPrice: 4000,
    });

    expect(mapped.compareAtPrice).toBeNull();
    expect(mapped.discountPercent).toBe(0);
  });

  it("marks zero-stock products unavailable", () => {
    expect(toPublicProduct({ ...product, stock: 0 }).inStock).toBe(false);
  });
});

describe("public store DTO", () => {
  const store = {
    _id: "store-1",
    name: "Ada Market",
    slug: "ada-market",
    description: "Neighbourhood grocery",
    logo: "https://cdn.example/logo.png",
    coverImage: null,
    category: "Groceries",
    address: {
      street: "1 Marina",
      city: "Lagos",
      lga: "Eti Osa",
      state: "Lagos",
      country: "Nigeria",
    },
    location: { type: "Point", coordinates: [3.4, 6.5] },
    operatingHours: [
      { day: "monday", isOpen: true, openingTime: "08:00", closingTime: "18:00" },
    ],
    pickupInstructions: "Call on arrival",
    featured: true,
    email: "store@example.com",
    phoneNumber: "08000000000",
    legalBusinessName: "Ada Market Limited",
    representative: {
      fullName: "Ada Obi",
      idType: "nin",
      idNumber: "NIN123456789",
    },
    settlementAccount: {
      bankName: "GTBank",
      accountName: "Ada Market",
      accountNumber: "0123456789",
    },
    documents: [{ url: "https://cdn.example/cac.pdf" }],
    compliance: { termsAccepted: true },
    status: "approved",
    rejectionReason: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  };

  it("maps the safe storefront contract", () => {
    const mapped = toPublicStore(store, 4);

    expect(mapped).toMatchObject({
      _id: "store-1",
      name: "Ada Market",
      slug: "ada-market",
      productCount: 4,
      featured: true,
      category: "Groceries",
    });
    expect(mapped.address).toMatchObject({ city: "Lagos", state: "Lagos" });
    expect(mapped.location).toEqual({ type: "Point", coordinates: [3.4, 6.5] });
  });

  it("never exposes settlement, identity, document or contact fields", () => {
    const mapped = toPublicStore(store, 4) as Record<string, unknown>;

    expect(mapped).not.toHaveProperty("settlementAccount");
    expect(mapped).not.toHaveProperty("representative");
    expect(mapped).not.toHaveProperty("documents");
    expect(mapped).not.toHaveProperty("compliance");
    expect(mapped).not.toHaveProperty("email");
    expect(mapped).not.toHaveProperty("phoneNumber");
    expect(mapped).not.toHaveProperty("legalBusinessName");
    expect(mapped).not.toHaveProperty("status");
    expect(mapped).not.toHaveProperty("rejectionReason");
  });
});

describe("category derivation", () => {
  it("creates URL-safe keys", () => {
    expect(categoryKey("Home & Kitchen")).toBe("home-kitchen");
    expect(categoryKey("  ")).toBe("uncategorized");
  });

  it("merges labels that slugify to the same key", () => {
    const merged = mergeCategoryRows([
      {
        _id: "Home & Kitchen",
        productCount: 2,
        storeIds: ["store-1"],
        minPrice: 1000,
        maxPrice: 3000,
      },
      {
        _id: "home & kitchen",
        productCount: 3,
        storeIds: ["store-1", "store-2"],
        minPrice: 500,
        maxPrice: 5000,
      },
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      key: "home-kitchen",
      productCount: 5,
      storeCount: 2,
      priceRange: { min: 500, max: 5000 },
    });
  });

  it("sorts categories by product count then name", () => {
    const merged = mergeCategoryRows([
      { _id: "Zeta", productCount: 2 },
      { _id: "Alpha", productCount: 5 },
      { _id: "Beta", productCount: 2 },
    ]);

    expect(merged.map((category) => category.name)).toEqual([
      "Alpha",
      "Beta",
      "Zeta",
    ]);
  });
});

describe("public sorting", () => {
  it("puts featured products first regardless of direction", () => {
    expect(publicProductSort("featured", "asc")).toEqual({
      featured: -1,
      createdAt: -1,
      _id: -1,
    });
  });

  it("uses the requested direction with a stable id tie-breaker", () => {
    expect(publicProductSort("price", "asc")).toEqual({ price: 1, _id: 1 });
    expect(publicStoreSort("createdAt", "desc")).toEqual({
      createdAt: -1,
      _id: -1,
    });
  });
});

describe("public marketplace query schemas", () => {
  it("defaults product pagination and sort", () => {
    expect(publicProductQuerySchema.parse({})).toMatchObject({
      page: 1,
      limit: 20,
      sortBy: "createdAt",
      sortOrder: "desc",
    });
  });

  it("coerces product filters and rejects unknown availability", () => {
    const parsed = publicProductQuerySchema.parse({
      minPrice: "1000",
      maxPrice: "9000",
      availability: "in_stock",
      page: "2",
      limit: "50",
    });

    expect(parsed).toMatchObject({
      minPrice: 1000,
      maxPrice: 9000,
      availability: "in_stock",
      page: 2,
      limit: 50,
    });
    expect(
      publicProductQuerySchema.safeParse({ availability: "maybe" }).success,
    ).toBe(false);
  });

  it("defaults store sorting to product count and category lists to 50", () => {
    expect(publicStoreQuerySchema.parse({}).sortBy).toBe("productCount");
    expect(publicCategoryQuerySchema.parse({})).toMatchObject({
      page: 1,
      limit: 50,
      sortBy: "productCount",
    });
  });

  it("accepts q as a search alias and rejects an empty term", () => {
    expect(marketplaceSearchQuerySchema.parse({ q: "rice" }).query).toBe(
      "rice",
    );
    expect(marketplaceSearchQuerySchema.safeParse({}).success).toBe(false);
    expect(
      marketplaceSearchQuerySchema.safeParse({ query: "   " }).success,
    ).toBe(false);
  });
});
