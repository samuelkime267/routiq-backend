import Product from "@/models/product.model";
import Store from "@/models/store.model";
import Order, { GMV_ORDER_STATUSES } from "@/models/order.model";
import type {
  PublicProductQuery,
  PublicProductSortField,
} from "@/schemas/marketplace";
import { createError } from "@/utils";
import {
  PUBLIC_PRODUCT_POPULATE,
  publicProductMatch,
  publicStoreMatch,
  resolvePublicScope,
  toPublicProduct,
  type PublicProduct,
  type PublicScope,
} from "@/services/marketplace/visibility";

type AnyRecord = Record<string, any>;

export type PublicProductFilters = PublicProductQuery & {
  featured?: boolean;
  onSale?: boolean;
  /** Multiple raw category labels that slugify to the same public key. */
  categoryNames?: string[];
};

export interface PublicProductListResult {
  products: PublicProduct[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface RankedProductResult extends PublicProductListResult {
  ranking: {
    basis: "sales" | "newest";
    windowDays: number | null;
    label: string;
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

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

/** Deterministic public sort. `featured` always puts featured items first. */
export function publicProductSort(
  sortBy: PublicProductSortField,
  sortOrder: "asc" | "desc",
): Record<string, 1 | -1> {
  const direction = sortOrder === "asc" ? 1 : -1;

  if (sortBy === "featured") {
    return { featured: -1, createdAt: -1, _id: -1 };
  }

  return { [sortBy]: direction, _id: direction };
}

async function storeIdsMatchingSearch(search: string, scope: PublicScope) {
  return Store.find({
    ...publicStoreMatch(scope),
    $or: [{ name: regex(search) }, { category: regex(search) }],
  }).distinct("_id");
}

export async function buildPublicProductFilter(
  input: PublicProductFilters,
  scope: PublicScope,
): Promise<Record<string, unknown>> {
  const filter = publicProductMatch(scope);

  if (input.category) filter.category = input.category;
  if (input.categoryNames?.length) {
    filter.category = { $in: input.categoryNames };
  }
  // Assigning an id here intentionally replaces the `$in` scope: a store or
  // vendor outside the eligible set resolves to an empty result, not an
  // unfiltered catalogue.
  if (input.store) filter.store = input.store;
  if (input.vendor) filter.vendor = input.vendor;

  if (input.minPrice !== undefined || input.maxPrice !== undefined) {
    const price: Record<string, number> = {};
    if (input.minPrice !== undefined) price.$gte = input.minPrice;
    if (input.maxPrice !== undefined) price.$lte = input.maxPrice;
    filter.price = price;
  }

  if (input.availability === "in_stock") filter.stock = { $gt: 0 };
  if (input.availability === "out_of_stock") filter.stock = { $lte: 0 };

  if (input.featured) filter.featured = true;

  if (input.onSale) {
    filter.$expr = { $gt: ["$compareAtPrice", "$price"] };
  }

  if (input.search) {
    const pattern = regex(input.search);
    const storeIds = await storeIdsMatchingSearch(input.search, scope);

    filter.$or = [
      { name: pattern },
      { description: pattern },
      { category: pattern },
      { store: { $in: storeIds } },
    ];
  }

  return filter;
}

export async function queryPublicProducts(
  input: PublicProductFilters,
  scope?: PublicScope,
): Promise<PublicProductListResult> {
  const publicScope = scope ?? (await resolvePublicScope());
  const filter = await buildPublicProductFilter(input, publicScope);
  const skip = (input.page - 1) * input.limit;

  const [products, total] = await Promise.all([
    Product.find(filter)
      .populate([...PUBLIC_PRODUCT_POPULATE])
      .sort(publicProductSort(input.sortBy, input.sortOrder))
      .skip(skip)
      .limit(input.limit)
      .lean(),
    Product.countDocuments(filter),
  ]);

  return {
    products: products.map((product) => toPublicProduct(product as AnyRecord)),
    pagination: pagination(input.page, input.limit, total),
  };
}

export async function getPublicProduct(productIdOrSlug: string) {
  const scope = await resolvePublicScope();
  const identity = isObjectId(productIdOrSlug)
    ? { _id: productIdOrSlug }
    : { slug: productIdOrSlug.trim().toLowerCase() };

  const product = await Product.findOne({
    ...publicProductMatch(scope, identity),
  })
    .populate([...PUBLIC_PRODUCT_POPULATE])
    .lean();

  if (!product) throw createError("Product not found", 404);

  const related = await Product.find(
    publicProductMatch(scope, {
      category: (product as AnyRecord).category,
      _id: { $ne: (product as AnyRecord)._id },
    }),
  )
    .populate([...PUBLIC_PRODUCT_POPULATE])
    .sort({ createdAt: -1, _id: -1 })
    .limit(8)
    .lean();

  return {
    product: toPublicProduct(product as AnyRecord),
    related: related.map((item) => toPublicProduct(item as AnyRecord)),
  };
}

/**
 * Ranks published products by units sold in a recent window. Orders that were
 * cancelled or refunded, or never paid, are excluded. When no qualifying sales
 * exist the endpoint falls back to newest arrivals so a fresh marketplace still
 * renders a useful shelf.
 */
export async function rankedPublicProducts(input: {
  sinceDays: number;
  label: string;
  query: PublicProductQuery;
}): Promise<RankedProductResult> {
  const scope = await resolvePublicScope();
  const filter = await buildPublicProductFilter(
    { ...input.query, page: 1, limit: 1 },
    scope,
  );
  const since = new Date(Date.now() - input.sinceDays * DAY_MS);
  const { page, limit } = input.query;
  const skip = (page - 1) * limit;

  const [facet] = await Order.aggregate<{
    rows: Array<{ product: AnyRecord; unitsSold: number; orderCount: number }>;
    total: Array<{ count: number }>;
  }>([
    {
      $match: {
        status: { $in: [...GMV_ORDER_STATUSES] },
        paymentStatus: "paid",
        createdAt: { $gte: since },
      },
    },
    { $unwind: "$items" },
    {
      $group: {
        _id: "$items.product",
        unitsSold: { $sum: "$items.quantity" },
        orders: { $addToSet: "$_id" },
      },
    },
    {
      $lookup: {
        from: Product.collection.name,
        let: { productId: "$_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$productId"] } } },
          { $match: filter },
          { $limit: 1 },
        ],
        as: "productRecord",
      },
    },
    { $unwind: "$productRecord" },
    {
      $sort: {
        unitsSold: -1,
        "productRecord.createdAt": -1,
        _id: 1,
      },
    },
    {
      $facet: {
        rows: [
          { $skip: skip },
          { $limit: limit },
          {
            $replaceRoot: {
              newRoot: {
                product: "$productRecord",
                unitsSold: "$unitsSold",
                orderCount: { $size: "$orders" },
              },
            },
          },
        ],
        total: [{ $count: "count" }],
      },
    },
  ]);

  const total = facet?.total[0]?.count ?? 0;

  if (total === 0) {
    const fallback = await queryPublicProducts(
      {
        ...input.query,
        page,
        limit,
      },
      scope,
    );

    return {
      ...fallback,
      ranking: {
        basis: "newest",
        windowDays: null,
        label:
          "No recent sales match these filters, so the filtered catalogue is shown",
      },
    };
  }

  const rows = (facet?.rows ?? []).map((row) => row.product);
  const populated = (await Product.populate(rows, [
    ...PUBLIC_PRODUCT_POPULATE,
  ])) as unknown as AnyRecord[];

  return {
    products: populated.map((product) => toPublicProduct(product)),
    pagination: pagination(page, limit, total),
    ranking: {
      basis: "sales",
      windowDays: input.sinceDays,
      label: input.label,
    },
  };
}
