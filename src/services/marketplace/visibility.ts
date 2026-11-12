import Product from "@/models/product.model";
import Store from "@/models/store.model";
import User from "@/models/user.model";
import { slugify } from "@/utils";

/**
 * Central public-marketplace visibility rules.
 *
 * Every public catalogue query must go through this module. The API never
 * relies on the frontend to hide a listing that failed moderation, belongs to
 * a store that is not approved, or is owned by an inactive vendor.
 *
 * The rules are expressed as data filters so the same predicate can be reused
 * for list queries, detail lookups, category counts and search. A product can
 * only be public when all three layers agree:
 *
 *   product approved + published
 *   store approved
 *   vendor role "vendor" and status "active"
 */

type AnyRecord = Record<string, any>;

export const PUBLIC_PRODUCT_STATUS = "approved" as const;
export const PUBLIC_PRODUCT_PUBLICATION_STATUS = "published" as const;
export const PUBLIC_STORE_STATUS = "approved" as const;
export const PUBLIC_VENDOR_ROLE = "vendor" as const;
export const PUBLIC_VENDOR_STATUS = "active" as const;

export interface PublicScope {
  /** Active vendor accounts. */
  vendorIds: unknown[];
  /** Approved stores owned by an active vendor. */
  storeIds: unknown[];
}

export interface PublicProductStoreSummary {
  _id: string;
  name: string;
  slug: string;
  logo: string | null;
  category: string;
}

export interface PublicProductVendorSummary {
  _id: string;
  name: string;
}

export interface PublicProduct {
  _id: string;
  name: string;
  slug: string;
  description: string | null;
  images: string[];
  price: number;
  compareAtPrice: number | null;
  discountPercent: number;
  currency: "NGN";
  stock: number;
  inStock: boolean;
  category: string;
  store: PublicProductStoreSummary | null;
  vendor: PublicProductVendorSummary | null;
  featured: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface PublicStoreAddress {
  street: string | null;
  city: string | null;
  lga: string | null;
  state: string | null;
  country: string | null;
}

export interface PublicStoreOperatingHour {
  day: string;
  isOpen: boolean;
  openingTime: string | null;
  closingTime: string | null;
}

export interface PublicStore {
  _id: string;
  name: string;
  slug: string;
  description: string | null;
  logo: string | null;
  coverImage: string | null;
  category: string;
  address: PublicStoreAddress | null;
  location: { type: "Point"; coordinates: [number, number] } | null;
  operatingHours: PublicStoreOperatingHour[];
  pickupInstructions: string | null;
  productCount: number;
  featured: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface PublicCategory {
  key: string;
  name: string;
  productCount: number;
  storeCount: number;
  priceRange: {
    min: number | null;
    max: number | null;
  };
}

export interface CategoryAggregateRow {
  _id: string;
  productCount: number;
  storeIds?: unknown[];
  minPrice?: number | null;
  maxPrice?: number | null;
}

export const PUBLIC_PRODUCT_POPULATE = [
  { path: "store", select: "name slug category logo" },
  { path: "vendor", select: "name" },
] as const;

export const PUBLIC_STORE_PROJECTION = [
  "name",
  "slug",
  "description",
  "logo",
  "coverImage",
  "category",
  "address",
  "location",
  "operatingHours",
  "pickupInstructions",
  "featured",
  "createdAt",
  "updatedAt",
].join(" ");

/** Product-level predicate. `storeIds` is the approved-store set. */
export function publicProductMatch(
  scope: PublicScope,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    status: PUBLIC_PRODUCT_STATUS,
    publicationStatus: PUBLIC_PRODUCT_PUBLICATION_STATUS,
    vendor: { $in: scope.vendorIds },
    store: { $in: scope.storeIds },
    ...overrides,
  };
}

/**
 * Product predicate without the store constraint. Needed inside `$lookup`
 * pipelines that already know the store from the parent document.
 */
export function publicProductBaseMatch(
  scope: Pick<PublicScope, "vendorIds">,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    status: PUBLIC_PRODUCT_STATUS,
    publicationStatus: PUBLIC_PRODUCT_PUBLICATION_STATUS,
    vendor: { $in: scope.vendorIds },
    ...overrides,
  };
}

/** Store-level predicate. Only approved stores owned by active vendors. */
export function publicStoreMatch(
  scope: Pick<PublicScope, "vendorIds">,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    status: PUBLIC_STORE_STATUS,
    owner: { $in: scope.vendorIds },
    ...overrides,
  };
}

/**
 * Resolves the eligible vendor and store sets once per request. Two indexed
 * `distinct` queries are cheaper and easier to reason about than joining users
 * and stores in every product aggregation.
 */
export async function resolvePublicScope(): Promise<PublicScope> {
  const vendorIds = await User.find({
    role: PUBLIC_VENDOR_ROLE,
    status: PUBLIC_VENDOR_STATUS,
  }).distinct("_id");

  if (!vendorIds.length) {
    return { vendorIds: [], storeIds: [] };
  }

  const storeIds = await Store.find({
    status: PUBLIC_STORE_STATUS,
    owner: { $in: vendorIds },
  }).distinct("_id");

  return { vendorIds, storeIds: storeIds.length ? storeIds : [] };
}

const isRecord = (value: unknown): value is AnyRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const toIso = (value: unknown): string | null => {
  if (!value) return null;

  const date = new Date(value as string | number | Date);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * Maps a populated product document to the public contract. Internal fields
 * (moderation status, rejection/suspension reasons, SKU and actor ids) are
 * intentionally not returned.
 */
export function toPublicProduct(product: AnyRecord): PublicProduct {
  const price = toNumber(product.price);
  const rawCompareAt = product.compareAtPrice;
  const compareAtPrice =
    rawCompareAt !== null && rawCompareAt !== undefined
      ? toNumber(rawCompareAt)
      : null;
  const hasDiscount = compareAtPrice !== null && compareAtPrice > price;
  const stock = toNumber(product.stock);

  const store = isRecord(product.store) ? product.store : null;
  const vendor = isRecord(product.vendor) ? product.vendor : null;

  return {
    _id: String(product._id),
    name: String(product.name ?? ""),
    slug: String(product.slug ?? ""),
    description: product.description ?? null,
    images: Array.isArray(product.images)
      ? product.images.filter((image): image is string => Boolean(image))
      : [],
    price,
    compareAtPrice: hasDiscount ? compareAtPrice : null,
    discountPercent:
      hasDiscount && compareAtPrice
        ? Math.round(((compareAtPrice - price) / compareAtPrice) * 100)
        : 0,
    currency: "NGN",
    stock,
    inStock: stock > 0,
    category: String(product.category ?? ""),
    store: store
      ? {
          _id: String(store._id),
          name: String(store.name ?? ""),
          slug: String(store.slug ?? ""),
          logo: store.logo ?? null,
          category: String(store.category ?? ""),
        }
      : null,
    vendor: vendor
      ? { _id: String(vendor._id), name: String(vendor.name ?? "") }
      : null,
    featured: Boolean(product.featured),
    createdAt: toIso(product.createdAt),
    updatedAt: toIso(product.updatedAt),
  };
}

/**
 * Maps a store to its public contract. Settlement details, the representative's
 * NIN/BVN, uploaded documents, compliance records and contact email are never
 * exposed.
 */
export function toPublicStore(
  store: AnyRecord,
  productCount = 0,
): PublicStore {
  const address = isRecord(store.address)
    ? {
        street: store.address.street ?? null,
        city: store.address.city ?? null,
        lga: store.address.lga ?? null,
        state: store.address.state ?? null,
        country: store.address.country ?? null,
      }
    : null;

  const location =
    isRecord(store.location) &&
    store.location.type === "Point" &&
    Array.isArray(store.location.coordinates) &&
    store.location.coordinates.length === 2
      ? {
          type: "Point" as const,
          coordinates: [
            toNumber(store.location.coordinates[0]),
            toNumber(store.location.coordinates[1]),
          ] as [number, number],
        }
      : null;

  return {
    _id: String(store._id),
    name: String(store.name ?? ""),
    slug: String(store.slug ?? ""),
    description: store.description ?? null,
    logo: store.logo ?? null,
    coverImage: store.coverImage ?? null,
    category: String(store.category ?? ""),
    address,
    location,
    operatingHours: Array.isArray(store.operatingHours)
      ? store.operatingHours.map((hour: AnyRecord) => ({
          day: String(hour.day ?? ""),
          isOpen: Boolean(hour.isOpen),
          openingTime: hour.openingTime ?? null,
          closingTime: hour.closingTime ?? null,
        }))
      : [],
    pickupInstructions: store.pickupInstructions ?? null,
    productCount: toNumber(productCount),
    featured: Boolean(store.featured),
    createdAt: toIso(store.createdAt),
    updatedAt: toIso(store.updatedAt),
  };
}

/** Stable, URL-safe category key derived from the stored label. */
export function categoryKey(name: string) {
  return slugify(name) || "uncategorized";
}

/**
 * Aggregates category rows by key so two labels that slugify identically do not
 * produce duplicate links. This is pure logic and unit-tested directly.
 */
export function mergeCategoryRows(
  rows: readonly CategoryAggregateRow[],
): PublicCategory[] {
  const merged = new Map<
    string,
    {
      name: string;
      productCount: number;
      storeIds: Set<string>;
      min: number | null;
      max: number | null;
    }
  >();

  for (const row of rows) {
    const name = String(row._id ?? "").trim();
    if (!name) continue;

    const key = categoryKey(name);
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, {
        name,
        productCount: toNumber(row.productCount),
        storeIds: new Set((row.storeIds ?? []).map(String)),
        min: row.minPrice ?? null,
        max: row.maxPrice ?? null,
      });
      continue;
    }

    existing.productCount += toNumber(row.productCount);

    for (const storeId of row.storeIds ?? []) {
      existing.storeIds.add(String(storeId));
    }

    if (row.minPrice !== null && row.minPrice !== undefined) {
      existing.min = existing.min === null ? row.minPrice : Math.min(existing.min, row.minPrice);
    }

    if (row.maxPrice !== null && row.maxPrice !== undefined) {
      existing.max = existing.max === null ? row.maxPrice : Math.max(existing.max, row.maxPrice);
    }
  }

  return [...merged.entries()]
    .map(([key, value]) => ({
      key,
      name: value.name,
      productCount: value.productCount,
      storeCount: value.storeIds.size,
      priceRange: { min: value.min, max: value.max },
    }))
    .sort(
      (left, right) =>
        right.productCount - left.productCount ||
        left.name.localeCompare(right.name),
    );
}
