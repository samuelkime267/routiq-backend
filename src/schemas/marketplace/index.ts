import { z } from "zod";

/**
 * Public marketplace query contracts.
 *
 * These are deliberately separate from the admin catalogue schemas: public
 * callers cannot filter on moderation state, and only fields that are safe for
 * anonymous consumers are accepted.
 */

const objectId = z
  .string()
  .trim()
  .regex(/^[a-f\d]{24}$/i, "Enter a valid id")
  .optional();

const optionalMoney = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.coerce.number().min(0).optional(),
);

export const PUBLIC_PRODUCT_SORT_FIELDS = [
  "createdAt",
  "price",
  "name",
  "featured",
] as const;
export type PublicProductSortField =
  (typeof PUBLIC_PRODUCT_SORT_FIELDS)[number];

export const PUBLIC_PRODUCT_AVAILABILITY = [
  "in_stock",
  "out_of_stock",
] as const;
export type PublicProductAvailability =
  (typeof PUBLIC_PRODUCT_AVAILABILITY)[number];

export const publicProductQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  category: z.string().trim().max(80).optional(),
  store: objectId,
  vendor: objectId,
  minPrice: optionalMoney,
  maxPrice: optionalMoney,
  availability: z.enum(PUBLIC_PRODUCT_AVAILABILITY).optional(),
  sortBy: z.enum(PUBLIC_PRODUCT_SORT_FIELDS).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PublicProductQuery = z.infer<typeof publicProductQuerySchema>;

export const PUBLIC_STORE_SORT_FIELDS = [
  "name",
  "createdAt",
  "productCount",
] as const;
export type PublicStoreSortField = (typeof PUBLIC_STORE_SORT_FIELDS)[number];

export const publicStoreQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  category: z.string().trim().max(80).optional(),
  state: z.string().trim().max(80).optional(),
  city: z.string().trim().max(80).optional(),
  lga: z.string().trim().max(80).optional(),
  sortBy: z.enum(PUBLIC_STORE_SORT_FIELDS).default("productCount"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PublicStoreQuery = z.infer<typeof publicStoreQuerySchema>;

export const PUBLIC_CATEGORY_SORT_FIELDS = [
  "name",
  "productCount",
] as const;
export type PublicCategorySortField =
  (typeof PUBLIC_CATEGORY_SORT_FIELDS)[number];

export const publicCategoryQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  sortBy: z.enum(PUBLIC_CATEGORY_SORT_FIELDS).default("productCount"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type PublicCategoryQuery = z.infer<typeof publicCategoryQuerySchema>;

/**
 * Category product shelves accept the same contract as the catalogue, minus
 * the category filter (it comes from the path).
 */
export const publicCategoryProductsQuerySchema = publicProductQuerySchema.omit({
  category: true,
});

export type PublicCategoryProductsQuery = z.infer<
  typeof publicCategoryProductsQuerySchema
>;

export const MARKETPLACE_SEARCH_TYPES = [
  "all",
  "products",
  "stores",
] as const;
export type MarketplaceSearchType =
  (typeof MARKETPLACE_SEARCH_TYPES)[number];

export const MARKETPLACE_SEARCH_SORTS = [
  "relevance",
  "newest",
  "price_asc",
  "price_desc",
] as const;
export type MarketplaceSearchSort =
  (typeof MARKETPLACE_SEARCH_SORTS)[number];

/**
 * `q` is accepted as an alias for `query` because both are common in search
 * UIs. At least one of them must be present.
 */
export const marketplaceSearchQuerySchema = z
  .object({
    query: z.string().trim().min(1).max(120).optional(),
    q: z.string().trim().min(1).max(120).optional(),
    category: z.string().trim().max(80).optional(),
    type: z.enum(MARKETPLACE_SEARCH_TYPES).default("all"),
    sortBy: z.enum(MARKETPLACE_SEARCH_SORTS).default("relevance"),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .transform((value) => ({
    ...value,
    query: value.query ?? value.q ?? "",
  }))
  .refine((value) => value.query.length > 0, {
    message: "Enter a search term",
    path: ["query"],
  });

export type MarketplaceSearchQuery = z.infer<
  typeof marketplaceSearchQuerySchema
>;
