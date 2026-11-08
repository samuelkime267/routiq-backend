import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomError } from "@/types";

const { reviewCreate, recordActivity, notifyVendor, actorFromUser } =
  vi.hoisted(() => ({
    reviewCreate: vi.fn(),
    recordActivity: vi.fn(),
    notifyVendor: vi.fn(),
    actorFromUser: vi.fn(() => ({
      id: "admin-1",
      name: "Ada Admin",
      role: "CATALOG_ADMIN",
    })),
  }));

vi.mock("@/models/productReview.model", () => ({
  default: { create: reviewCreate },
}));
vi.mock("@/lib/activity", () => ({ recordActivity, actorFromUser }));
vi.mock("@/services/notifications/notify", () => ({ notifyVendor }));

import { assertPermission } from "@/utils/adminAccess";
import {
  assertProductAction,
  canPerformProductAction,
  performProductAction,
  type ProductAction,
} from "@/services/products/workflow";

const admin = {
  _id: "admin-1",
  name: "Ada Admin",
  role: "admin",
  adminRole: "CATALOG_ADMIN",
};

const product = (overrides: Record<string, unknown> = {}) => ({
  _id: "product-1",
  name: "Ankara Throw Pillow",
  vendor: "vendor-1",
  store: "store-1",
  status: "pending",
  publicationStatus: "unpublished",
  rejectionReason: null,
  suspensionReason: null,
  suspendedAt: null,
  suspendedBy: null,
  previousStatus: null,
  reviewedAt: null,
  reviewedBy: null,
  save: vi.fn(),
  ...overrides,
});

const run = (
  target: ReturnType<typeof product>,
  action: ProductAction,
  extra = {},
) =>
  performProductAction({
    product: target as never,
    action,
    actor: admin,
    ...extra,
  });

describe("product moderation permissions", () => {
  it("allows catalog admins to view and moderate products", () => {
    expect(() =>
      assertPermission(
        { role: "admin", adminStatus: "ACTIVE", adminRole: "CATALOG_ADMIN" },
        ["products.view", "products.moderate"],
      ),
    ).not.toThrow();
  });

  it("does not let operations admins moderate the catalogue", () => {
    try {
      assertPermission(
        {
          role: "admin",
          adminStatus: "ACTIVE",
          adminRole: "OPERATIONS_ADMIN",
        },
        ["products.moderate"],
      );
      throw new Error("expected the moderation permission check to fail");
    } catch (error) {
      expect((error as CustomError).statusCode).toBe(403);
    }
  });

  it("does not give support admins catalogue access", () => {
    try {
      assertPermission(
        { role: "admin", adminStatus: "ACTIVE", adminRole: "SUPPORT_ADMIN" },
        ["products.view"],
      );
      throw new Error("expected the view permission check to fail");
    } catch (error) {
      expect((error as CustomError).statusCode).toBe(403);
    }
  });
});

describe("product status transitions", () => {
  it("only approves or rejects pending products", () => {
    expect(canPerformProductAction("pending", "approve")).toBe(true);
    expect(canPerformProductAction("pending", "reject")).toBe(true);
    expect(canPerformProductAction("approved", "approve")).toBe(false);
    expect(canPerformProductAction("rejected", "approve")).toBe(false);
    expect(canPerformProductAction("draft", "reject")).toBe(false);
  });

  it("only suspends approved products and only restores suspended ones", () => {
    expect(canPerformProductAction("approved", "suspend")).toBe(true);
    expect(canPerformProductAction("pending", "suspend")).toBe(false);
    expect(canPerformProductAction("suspended", "restore")).toBe(true);
    expect(canPerformProductAction("approved", "restore")).toBe(false);
  });

  it("rejects illegal transitions with a 400", () => {
    try {
      assertProductAction("approved", "approve");
      throw new Error("expected transition check to fail");
    } catch (error) {
      expect((error as CustomError).statusCode).toBe(400);
      expect((error as CustomError).message).toContain(
        "cannot be approved",
      );
    }
  });
});

describe("performProductAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reviewCreate.mockResolvedValue({ _id: "review-1" });
  });

  it("approves a pending product without publishing it", async () => {
    const target = product();

    const result = await run(target, "approve", { note: "Images verified" });

    expect(result.fromStatus).toBe("pending");
    expect(result.toStatus).toBe("approved");
    expect(target.status).toBe("approved");
    expect(target.publicationStatus).toBe("unpublished");
    expect(target.reviewedAt).toBeInstanceOf(Date);
    expect(target.save).toHaveBeenCalledTimes(1);
    expect(reviewCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        product: "product-1",
        action: "approved",
        fromStatus: "pending",
        toStatus: "approved",
        message: "Images verified",
        actor: "admin-1",
        actorRole: "admin",
      }),
    );
    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "product_approved",
        subject: expect.objectContaining({
          type: "product",
          id: "product-1",
        }),
        metadata: expect.objectContaining({
          publicationStatus: "unpublished",
        }),
      }),
    );
    expect(notifyVendor).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: "vendor-1",
        type: "product_approved",
        metadata: expect.objectContaining({ status: "approved" }),
      }),
    );
  });

  it("never changes publication when a product is already published", async () => {
    const target = product({ publicationStatus: "published" });

    await run(target, "approve");

    expect(target.publicationStatus).toBe("published");
  });

  it("blocks a duplicate approval without side effects", async () => {
    const target = product({ status: "approved" });

    await expect(run(target, "approve")).rejects.toMatchObject({
      statusCode: 400,
    });

    expect(target.save).not.toHaveBeenCalled();
    expect(reviewCreate).not.toHaveBeenCalled();
    expect(recordActivity).not.toHaveBeenCalled();
    expect(notifyVendor).not.toHaveBeenCalled();
  });

  it("rejects a pending product with a required reason", async () => {
    const target = product();

    await run(target, "reject", { reason: "Image resolution is too low" });

    expect(target.status).toBe("rejected");
    expect(target.rejectionReason).toBe("Image resolution is too low");
    expect(reviewCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "rejected",
        reason: "Image resolution is too low",
      }),
    );
    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({ type: "product_rejected" }),
    );
    expect(notifyVendor).toHaveBeenCalledWith(
      expect.objectContaining({ type: "product_rejected" }),
    );
  });

  it("refuses a rejection without a usable reason", async () => {
    const target = product();

    await expect(run(target, "reject", { reason: "no" })).rejects.toMatchObject(
      { statusCode: 400 },
    );

    expect(target.save).not.toHaveBeenCalled();
    expect(notifyVendor).not.toHaveBeenCalled();
  });

  it("suspends an approved product and restores its previous status", async () => {
    const target = product({ status: "approved", publicationStatus: "published" });

    await run(target, "suspend", { reason: "Repeated misleading claims" });

    expect(target.status).toBe("suspended");
    expect(target.previousStatus).toBe("approved");
    expect(target.suspensionReason).toBe("Repeated misleading claims");
    expect(target.suspendedAt).toBeInstanceOf(Date);
    expect(target.publicationStatus).toBe("published");
    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({ type: "product_suspended" }),
    );
    expect(notifyVendor).toHaveBeenCalledWith(
      expect.objectContaining({ type: "product_suspended" }),
    );

    await run(target, "restore", { note: "Appeal accepted" });

    expect(target.status).toBe("approved");
    expect(target.previousStatus).toBeNull();
    expect(target.suspensionReason).toBeNull();
    expect(target.suspendedAt).toBeNull();
    expect(target.publicationStatus).toBe("published");
    expect(reviewCreate).toHaveBeenCalledWith(
      expect.objectContaining({ action: "restored", toStatus: "approved" }),
    );
    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({ type: "product_restored" }),
    );
    expect(notifyVendor).toHaveBeenCalledWith(
      expect.objectContaining({ type: "product_restored" }),
    );
  });

  it("refuses a suspension without a reason", async () => {
    const target = product({ status: "approved" });

    await expect(run(target, "suspend")).rejects.toMatchObject({
      statusCode: 400,
    });

    expect(target.save).not.toHaveBeenCalled();
  });
});
