import Product, {
  PRODUCT_PUBLICATION_STATUSES,
  PRODUCT_STATUSES,
  type ProductPublicationStatus,
  type ProductStatus,
} from "@/models/product.model";

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Shared joins for the admin catalogue and product detail responses. */
export const PRODUCT_POPULATE = [
  { path: "vendor", select: "name email username status profilePicture" },
  { path: "store", select: "name slug status category logo" },
] as const;

export interface ProductFilterInput {
  search?: string;
  status?: ProductStatus;
  publicationStatus?: ProductPublicationStatus;
  category?: string;
  vendor?: string;
  store?: string;
  minPrice?: number;
  maxPrice?: number;
  createdFrom?: string;
  createdTo?: string;
}

function endOfDayIfDateOnly(value: string) {
  const date = new Date(value);

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    date.setUTCHours(23, 59, 59, 999);
  }

  return date;
}

/**
 * Applies the shared catalogue filters used by both the full directory and the
 * pending moderation queue. Filters stay server-side so pagination counts are
 * accurate.
 */
export function applyProductFilters(
  filter: Record<string, unknown>,
  input: ProductFilterInput,
): Record<string, unknown> {
  if (input.status) filter.status = input.status;
  if (input.publicationStatus) {
    // Documents created before publication tracking existed have no field and
    // are treated as unpublished.
    filter.publicationStatus =
      input.publicationStatus === "unpublished"
        ? { $in: ["unpublished", null] }
        : input.publicationStatus;
  }
  if (input.category) filter.category = input.category;
  if (input.vendor) filter.vendor = input.vendor;
  if (input.store) filter.store = input.store;

  if (input.minPrice !== undefined || input.maxPrice !== undefined) {
    const price: Record<string, number> = {};

    if (input.minPrice !== undefined) price.$gte = input.minPrice;
    if (input.maxPrice !== undefined) price.$lte = input.maxPrice;

    filter.price = price;
  }

  if (input.createdFrom || input.createdTo) {
    const createdAt: Record<string, Date> = {};

    if (input.createdFrom) createdAt.$gte = new Date(input.createdFrom);
    if (input.createdTo) {
      createdAt.$lte = endOfDayIfDateOnly(input.createdTo);
    }

    filter.createdAt = createdAt;
  }

  if (input.search) {
    const pattern = new RegExp(escapeRegExp(input.search), "i");
    filter.$or = [
      { name: pattern },
      { sku: pattern },
      { slug: pattern },
      { category: pattern },
    ];
  }

  return filter;
}

export function productSort(
  sortBy: string,
  sortOrder: "asc" | "desc",
): Record<string, 1 | -1> {
  const direction = sortOrder === "asc" ? 1 : -1;

  // A stable secondary sort keeps pagination deterministic when many rows
  // share the same price, stock value or status.
  return { [sortBy]: direction, _id: direction };
}

export async function productStatusSummary(): Promise<
  Record<ProductStatus, number>
> {
  const rows = await Product.aggregate<{ _id: string; count: number }>([
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);

  const summary = PRODUCT_STATUSES.reduce<Record<string, number>>(
    (accumulator, status) => {
      accumulator[status] = 0;
      return accumulator;
    },
    {},
  );

  for (const row of rows) {
    if (row._id in summary) summary[row._id] = row.count;
  }

  return summary as Record<ProductStatus, number>;
}

export async function productPublicationSummary(): Promise<
  Record<ProductPublicationStatus, number>
> {
  const rows = await Product.aggregate<{ _id: string; count: number }>([
    {
      $group: {
        _id: { $ifNull: ["$publicationStatus", "unpublished"] },
        count: { $sum: 1 },
      },
    },
  ]);

  const summary = PRODUCT_PUBLICATION_STATUSES.reduce<Record<string, number>>(
    (accumulator, status) => {
      accumulator[status] = 0;
      return accumulator;
    },
    {},
  );

  for (const row of rows) {
    if (row._id in summary) summary[row._id] = row.count;
  }

  return summary as Record<ProductPublicationStatus, number>;
}
