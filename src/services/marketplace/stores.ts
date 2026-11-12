import Product from "@/models/product.model";
import Store from "@/models/store.model";
import type {
  PublicProductQuery,
  PublicStoreQuery,
  PublicStoreSortField,
} from "@/schemas/marketplace";
import { createError } from "@/utils";
import {
  PUBLIC_STORE_PROJECTION,
  publicProductBaseMatch,
  publicStoreMatch,
  resolvePublicScope,
  toPublicStore,
  type PublicScope,
  type PublicStore,
} from "@/services/marketplace/visibility";
import {
  queryPublicProducts,
  type PublicProductListResult,
} from "@/services/marketplace/products";

type AnyRecord = Record<string, any>;

export type PublicStoreFilters = PublicStoreQuery & {
  featured?: boolean;
};

export interface PublicStoreListResult {
  stores: PublicStore[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface FeaturedStoreResult extends PublicStoreListResult {
  ranking: {
    basis: "featured" | "newest";
    label: string;
  };
}

const isObjectId = (value: string) => /^[a-f\d]{24}$/i.test(value);

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const regex = (value: string) => new RegExp(escapeRegExp(value), "i");

function pagination(page: number, limit: number, total: number) {
  return {
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
  };
}

export function publicStoreSort(
  sortBy: PublicStoreSortField,
  sortOrder: "asc" | "desc",
): Record<string, 1 | -1> {
  const direction = sortOrder === "asc" ? 1 : -1;

  return { [sortBy]: direction, _id: direction };
}

function buildPublicStoreFilter(
  input: PublicStoreFilters,
  scope: PublicScope,
): Record<string, unknown> {
  const overrides: Record<string, unknown> = {};

  if (input.category) overrides.category = input.category;
  if (input.state) overrides["address.state"] = regex(input.state);
  if (input.city) overrides["address.city"] = regex(input.city);
  if (input.lga) overrides["address.lga"] = regex(input.lga);

  if (input.search) {
    const pattern = regex(input.search);
    overrides.$or = [
      { name: pattern },
      { description: pattern },
      { category: pattern },
    ];
  }

  if (input.featured) overrides.featured = true;

  return publicStoreMatch(scope, overrides);
}

export async function queryPublicStores(
  input: PublicStoreFilters,
  scope?: PublicScope,
): Promise<PublicStoreListResult> {
  const publicScope = scope ?? (await resolvePublicScope());
  const filter = buildPublicStoreFilter(input, publicScope);
  const skip = (input.page - 1) * input.limit;

  const [facet] = await Store.aggregate<{
    rows: AnyRecord[];
    total: Array<{ count: number }>;
  }>([
    { $match: filter },
    {
      $lookup: {
        from: Product.collection.name,
        let: { storeId: "$_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$store", "$$storeId"] } } },
          { $match: publicProductBaseMatch(publicScope) },
          { $count: "count" },
        ],
        as: "productCounts",
      },
    },
    {
      $addFields: {
        productCount: { $ifNull: [{ $first: "$productCounts.count" }, 0] },
      },
    },
    { $project: { productCounts: 0 } },
    { $sort: publicStoreSort(input.sortBy, input.sortOrder) },
    {
      $facet: {
        rows: [{ $skip: skip }, { $limit: input.limit }],
        total: [{ $count: "count" }],
      },
    },
  ]);

  const total = facet?.total[0]?.count ?? 0;

  return {
    stores: (facet?.rows ?? []).map((store) =>
      toPublicStore(store, store.productCount),
    ),
    pagination: pagination(input.page, input.limit, total),
  };
}

async function findPublicStoreDocument(
  storeIdOrSlug: string,
): Promise<AnyRecord & { _id: unknown }> {
  const scope = await resolvePublicScope();
  const identity = isObjectId(storeIdOrSlug)
    ? { _id: storeIdOrSlug }
    : { slug: storeIdOrSlug.trim().toLowerCase() };

  const store = await Store.findOne(publicStoreMatch(scope, identity))
    .select(PUBLIC_STORE_PROJECTION)
    .lean();

  if (!store) throw createError("Store not found", 404);

  return store as AnyRecord & { _id: unknown };
}

async function publicProductCount(
  storeId: unknown,
  scope: PublicScope,
): Promise<number> {
  return Product.countDocuments(
    publicProductBaseMatch(scope, { store: storeId }),
  );
}

export async function getPublicStore(storeIdOrSlug: string) {
  const store = await findPublicStoreDocument(storeIdOrSlug);
  const scope = await resolvePublicScope();
  const productCount = await publicProductCount(store._id, scope);

  return toPublicStore(store, productCount);
}

export async function listPublicStoreProducts(
  storeIdOrSlug: string,
  query: PublicProductQuery,
): Promise<{ store: PublicStore } & PublicProductListResult> {
  const store = await findPublicStoreDocument(storeIdOrSlug);
  const scope = await resolvePublicScope();
  const productCount = await publicProductCount(store._id, scope);

  const products = await queryPublicProducts(
    {
      ...query,
      store: String(store._id),
    },
    scope,
  );

  return {
    store: toPublicStore(store, productCount),
    ...products,
  };
}

export async function featuredPublicStores(input: {
  page: number;
  limit: number;
}): Promise<FeaturedStoreResult> {
  const scope = await resolvePublicScope();
  const featured = await queryPublicStores(
    {
      ...input,
      sortBy: "createdAt",
      sortOrder: "desc",
      featured: true,
    },
    scope,
  );

  if (featured.pagination.total > 0) {
    return {
      ...featured,
      ranking: {
        basis: "featured",
        label: "Curated marketplace stores",
      },
    };
  }

  const newest = await queryPublicStores(
    {
      ...input,
      sortBy: "createdAt",
      sortOrder: "desc",
    },
    scope,
  );

  return {
    ...newest,
    ranking: {
      basis: "newest",
      label: "No featured stores yet, so newest stores are shown",
    },
  };
}
