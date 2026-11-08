import { describe, expect, it } from "vitest";
import {
  listProductsQuerySchema,
  pendingProductsQuerySchema,
  rejectProductSchema,
  suspendProductSchema,
} from "@/schemas/product";
import { applyProductFilters } from "@/services/products/query";

describe("admin product query schemas", () => {
  it("applies pagination and sort defaults", () => {
    const query = listProductsQuerySchema.parse({});

    expect(query.page).toBe(1);
    expect(query.limit).toBe(20);
    expect(query.sortBy).toBe("createdAt");
    expect(query.sortOrder).toBe("desc");
  });

  it("parses filters used by the directory", () => {
    const query = listProductsQuerySchema.parse({
      status: "suspended",
      publicationStatus: "published",
      category: "Fashion",
      vendor: "64b7f4c2f1a2b3c4d5e6f701",
      store: "64b7f4c2f1a2b3c4d5e6f702",
      minPrice: "1500",
      maxPrice: "9000",
      createdFrom: "2026-01-01",
      createdTo: "2026-01-31",
      search: "ankara",
      sortBy: "price",
      sortOrder: "asc",
      page: "2",
      limit: "50",
    });

    expect(query).toMatchObject({
      status: "suspended",
      publicationStatus: "published",
      category: "Fashion",
      vendor: "64b7f4c2f1a2b3c4d5e6f701",
      store: "64b7f4c2f1a2b3c4d5e6f702",
      minPrice: 1500,
      maxPrice: 9000,
      createdFrom: "2026-01-01",
      createdTo: "2026-01-31",
      search: "ankara",
      sortBy: "price",
      sortOrder: "asc",
      page: 2,
      limit: 50,
    });
  });

  it("rejects unknown moderation statuses", () => {
    expect(() =>
      listProductsQuerySchema.parse({ status: "live" }),
    ).toThrow();
  });

  it("does not let the pending queue accept a status filter", () => {
    const query = pendingProductsQuerySchema.parse({ status: "approved" });

    expect(query).not.toHaveProperty("status");
  });
});

describe("product filter builder", () => {
  it("treats legacy products without a publication field as unpublished", () => {
    const filter = applyProductFilters(
      {},
      { publicationStatus: "unpublished" },
    );

    expect(filter.publicationStatus).toEqual({ $in: ["unpublished", null] });
  });

  it("combines text search, price and date ranges", () => {
    const filter = applyProductFilters(
      {},
      {
        search: "ankara",
        minPrice: 1000,
        maxPrice: 5000,
        createdFrom: "2026-01-01",
        createdTo: "2026-01-31",
      },
    );

    expect(filter.price).toEqual({ $gte: 1000, $lte: 5000 });
    expect(filter.createdAt).toBeInstanceOf(Object);
    expect(filter.$or).toHaveLength(4);
  });
});

describe("product moderation body schemas", () => {
  it("requires a meaningful rejection reason", () => {
    expect(() => rejectProductSchema.parse({ reason: "bad" })).toThrow();
    expect(
      rejectProductSchema.parse({ reason: "Image resolution is too low" }),
    ).toEqual({ reason: "Image resolution is too low" });
  });

  it("requires a meaningful suspension reason", () => {
    expect(() => suspendProductSchema.parse({})).toThrow();
    expect(
      suspendProductSchema.parse({ reason: "Misleading product claims" }),
    ).toEqual({ reason: "Misleading product claims" });
  });
});
