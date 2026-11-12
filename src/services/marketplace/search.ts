import type {
  MarketplaceSearchQuery,
  PublicProductSortField,
} from "@/schemas/marketplace";
import { categoryKey } from "@/services/marketplace/visibility";
import { aggregatePublicCategories } from "@/services/marketplace/categories";
import {
  queryPublicProducts,
  type PublicProductListResult,
} from "@/services/marketplace/products";
import {
  queryPublicStores,
  type PublicStoreListResult,
} from "@/services/marketplace/stores";

export interface PublicSearchResult {
  query: string;
  type: MarketplaceSearchQuery["type"];
  category: string | null;
  sortBy: MarketplaceSearchQuery["sortBy"];
  products?: PublicProductListResult;
  stores?: PublicStoreListResult;
}

function productSortFor(
  sortBy: MarketplaceSearchQuery["sortBy"],
): { sortBy: PublicProductSortField; sortOrder: "asc" | "desc" } {
  switch (sortBy) {
    case "price_asc":
      return { sortBy: "price", sortOrder: "asc" };
    case "price_desc":
      return { sortBy: "price", sortOrder: "desc" };
    case "newest":
    case "relevance":
    default:
      return { sortBy: "createdAt", sortOrder: "desc" };
  }
}

/**
 * Native-database search across products and stores.
 *
 * Products match name, description, category and the owning store's name.
 * Stores match name, description and category. Results respect the same public
 * visibility scope as the catalogue, so search can never surface a listing the
 * catalogue would hide.
 */
export async function searchPublicMarketplace(
  input: MarketplaceSearchQuery,
): Promise<PublicSearchResult> {
  const includeProducts = input.type === "all" || input.type === "products";
  const includeStores = input.type === "all" || input.type === "stores";

  // A category filter may be supplied as a public category key rather than the
  // raw vendor label. Resolve it so `/categories/home-kitchen` and search stay
  // consistent.
  let categoryNames: string[] | undefined;
  if (input.category) {
    const key = categoryKey(input.category);
    const categories = await aggregatePublicCategories();
    const match = categories.find((category) => category.key === key);
    categoryNames = match ? [match.name] : [input.category];
  }

  const productSort = productSortFor(input.sortBy);

  const [products, stores] = await Promise.all([
    includeProducts
      ? queryPublicProducts({
          search: input.query,
          category: categoryNames?.length === 1 ? categoryNames[0] : undefined,
          categoryNames:
            categoryNames && categoryNames.length > 1
              ? categoryNames
              : undefined,
          sortBy: productSort.sortBy,
          sortOrder: productSort.sortOrder,
          page: input.page,
          limit: input.limit,
        })
      : Promise.resolve(undefined),
    includeStores
      ? queryPublicStores({
          search: input.query,
          category: input.category,
          sortBy: "createdAt",
          sortOrder: "desc",
          page: input.page,
          limit: input.limit,
        })
      : Promise.resolve(undefined),
  ]);

  return {
    query: input.query,
    type: input.type,
    category: input.category ?? null,
    sortBy: input.sortBy,
    ...(products ? { products } : {}),
    ...(stores ? { stores } : {}),
  };
}
