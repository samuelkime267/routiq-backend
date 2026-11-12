import Product from "@/models/product.model";
import type {
  PublicCategoryQuery,
  PublicCategoryProductsQuery,
  PublicCategorySortField,
} from "@/schemas/marketplace";
import { createError } from "@/utils";
import {
  categoryKey,
  mergeCategoryRows,
  publicProductMatch,
  resolvePublicScope,
  type CategoryAggregateRow,
  type PublicCategory,
  type PublicScope,
} from "@/services/marketplace/visibility";
import {
  queryPublicProducts,
  type PublicProductListResult,
} from "@/services/marketplace/products";

export interface PublicCategoryListResult {
  categories: PublicCategory[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface PublicCategoryDetailResult {
  category: PublicCategory;
}

export interface PublicCategoryProductsResult
  extends PublicProductListResult {
  category: PublicCategory;
}

const CATEGORY_AGGREGATION = [
  {
    $group: {
      _id: "$category",
      productCount: { $sum: 1 },
      storeIds: { $addToSet: "$store" },
      minPrice: { $min: "$price" },
      maxPrice: { $max: "$price" },
    },
  },
];

/**
 * Derives the public category taxonomy from published products.
 *
 * There is no separate Category collection yet, so categories are whatever the
 * vendors typed. Grouping by a slugified key keeps "Home & Kitchen" and
 * "home & kitchen" on one public page.
 */
export async function aggregatePublicCategories(
  scope?: PublicScope,
): Promise<PublicCategory[]> {
  const publicScope = scope ?? (await resolvePublicScope());

  if (!publicScope.storeIds.length) return [];

  const rows = await Product.aggregate<CategoryAggregateRow>([
    { $match: publicProductMatch(publicScope) },
    ...CATEGORY_AGGREGATION,
  ]);

  return mergeCategoryRows(rows);
}

function sortCategories(
  categories: readonly PublicCategory[],
  sortBy: PublicCategorySortField,
  sortOrder: "asc" | "desc",
) {
  const direction = sortOrder === "asc" ? 1 : -1;

  return [...categories].sort((left, right) => {
    if (sortBy === "name") {
      return left.name.localeCompare(right.name) * direction;
    }

    return (
      (left.productCount - right.productCount) * direction ||
      left.name.localeCompare(right.name)
    );
  });
}

export async function listPublicCategories(
  input: PublicCategoryQuery,
): Promise<PublicCategoryListResult> {
  const scope = await resolvePublicScope();
  const all = await aggregatePublicCategories(scope);
  const term = input.search?.trim().toLowerCase();

  const filtered = term
    ? all.filter(
        (category) =>
          category.name.toLowerCase().includes(term) ||
          category.key.includes(term),
      )
    : all;

  const sorted = sortCategories(filtered, input.sortBy, input.sortOrder);
  const skip = (input.page - 1) * input.limit;

  return {
    categories: sorted.slice(skip, skip + input.limit),
    pagination: {
      page: input.page,
      limit: input.limit,
      total: sorted.length,
      pages: Math.ceil(sorted.length / input.limit),
    },
  };
}

function normaliseCategoryKey(value: string) {
  const decoded = (() => {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  })();

  return categoryKey(decoded);
}

async function findCategory(
  value: string,
  scope: PublicScope,
): Promise<PublicCategory> {
  const key = normaliseCategoryKey(value);
  const categories = await aggregatePublicCategories(scope);
  const category = categories.find((entry) => entry.key === key);

  if (!category) throw createError("Category not found", 404);

  return category;
}

/**
 * Resolves every raw label that maps to the requested public key so products
 * with slightly different category casing are still included.
 */
async function categoryLabelsForKey(key: string, scope: PublicScope) {
  const rows = await Product.aggregate<{ _id: string }>([
    { $match: publicProductMatch(scope) },
    { $group: { _id: "$category" } },
  ]);

  return rows
    .map((row) => String(row._id ?? "").trim())
    .filter((name) => name && categoryKey(name) === key);
}

export async function getPublicCategory(
  categoryId: string,
): Promise<PublicCategoryDetailResult> {
  const scope = await resolvePublicScope();
  const category = await findCategory(categoryId, scope);

  return { category };
}

export async function listPublicCategoryProducts(
  categoryId: string,
  input: PublicCategoryProductsQuery,
): Promise<PublicCategoryProductsResult> {
  const scope = await resolvePublicScope();
  const category = await findCategory(categoryId, scope);
  const categoryNames = await categoryLabelsForKey(category.key, scope);

  const result = await queryPublicProducts(
    {
      ...input,
      categoryNames,
    },
    scope,
  );

  return { category, ...result };
}
