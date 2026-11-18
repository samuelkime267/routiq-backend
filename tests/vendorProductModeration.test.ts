import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomError } from "@/types";

const { reviewCreate, recordActivity, actorFromUser } = vi.hoisted(() => ({
  reviewCreate: vi.fn(),
  recordActivity: vi.fn(),
  actorFromUser: vi.fn(() => ({ id: "vendor-1", name: "Ada", role: "vendor" })),
}));

vi.mock("@/models/product.model", () => ({
  default: {
    exists: vi.fn(),
    create: vi.fn(),
    findOne: vi.fn(),
    deleteOne: vi.fn(),
  },
}));
vi.mock("@/models/productReview.model", () => ({
  default: { create: reviewCreate, deleteMany: vi.fn() },
}));
vi.mock("@/models/order.model", () => ({
  default: { exists: vi.fn() },
}));
vi.mock("@/models/store.model", () => ({
  default: { findOne: vi.fn() },
}));
vi.mock("@/lib/activity", () => ({ recordActivity, actorFromUser }));

import Order from "@/models/order.model";
import {
  deleteVendorProduct,
  setVendorProductPublication,
  updateVendorProduct,
  updateVendorProductStock,
} from "@/services/vendorPortal/products";
import { assertVendorCanSell, storeAccessSummary } from "@/services/vendorPortal/access";

const vendor = { _id: "vendor-1", name: "Ada", role: "vendor" };
const approvedStore = { _id: "store-1", status: "approved" };
const suspendedStore = { _id: "store-1", status: "suspended" };

const product = (overrides: Record<string, unknown> = {}) => ({
  _id: "product-1",
  name: "Ankara Tote",
  category: "Bags",
  description: "Handmade tote",
  images: ["https://cdn.routiq.test/a.webp"],
  price: 12000,
  compareAtPrice: null,
  stock: 8,
  status: "approved",
  publicationStatus: "published",
  rejectionReason: "old reason",
  reviewedAt: new Date("2026-01-01"),
  reviewedBy: "admin-1",
  save: vi.fn(),
  ...overrides,
});

describe("vendor store access", () => {
  it("blocks a suspended store from selling", () => {
    try {
      assertVendorCanSell(suspendedStore as never);
      throw new Error("expected the suspension guard to throw");
    } catch (error) {
      expect((error as CustomError).statusCode).toBe(403);
      expect((error as Error).message).toMatch(/suspended/i);
    }
  });

  it("summarises access for the portal shell", () => {
    expect(storeAccessSummary(approvedStore as never)).toEqual({
      status: "approved",
      canSell: true,
      canWithdraw: true,
      restriction: null,
    });
    expect(storeAccessSummary(suspendedStore as never).canSell).toBe(false);
  });
});

describe("vendor product moderation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reviewCreate.mockResolvedValue({});
    recordActivity.mockResolvedValue(undefined);
  });

  it("sends an approved product back to moderation when shopper-visible content changes", async () => {
    const target = product();

    await updateVendorProduct(
      vendor as never,
      approvedStore as never,
      target as never,
      { name: "Ankara Tote — Large" },
    );

    expect(target.status).toBe("pending");
    expect(target.publicationStatus).toBe("unpublished");
    expect(target.rejectionReason).toBeNull();
    expect(target.reviewedAt).toBeNull();
    expect(target.save).toHaveBeenCalled();
    expect(reviewCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        product: "product-1",
        action: "submitted",
        fromStatus: "approved",
        toStatus: "pending",
        actorRole: "vendor",
      }),
    );
  });

  it("keeps approval when only price or stock changes", async () => {
    const target = product();

    await updateVendorProduct(
      vendor as never,
      approvedStore as never,
      target as never,
      { price: 14000, stock: 3 },
    );

    expect(target.status).toBe("approved");
    expect(target.publicationStatus).toBe("published");
    expect(reviewCreate).not.toHaveBeenCalled();
  });

  it("does not allow editing a suspended listing", async () => {
    await expect(
      updateVendorProduct(
        vendor as never,
        approvedStore as never,
        product({ status: "suspended" }) as never,
        { price: 100 },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("only publishes approved products", async () => {
    await expect(
      setVendorProductPublication(
        vendor as never,
        approvedStore as never,
        product({ status: "pending" }) as never,
        true,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects stock changes that would go negative", async () => {
    await expect(
      updateVendorProductStock(
        vendor as never,
        approvedStore as never,
        product({ stock: 1 }) as never,
        { delta: -5 },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("refuses to delete a product that already appears on an order", async () => {
    vi.mocked(Order.exists).mockResolvedValueOnce({ _id: "order-1" } as never);

    await expect(
      deleteVendorProduct(
        vendor as never,
        approvedStore as never,
        product({ status: "archived" }) as never,
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("blocks catalogue writes while the store is suspended", async () => {
    await expect(
      updateVendorProduct(
        vendor as never,
        suspendedStore as never,
        product() as never,
        { price: 100 },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
