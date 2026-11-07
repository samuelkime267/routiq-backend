import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomError } from "@/types";

const { reviewCreate, recordActivity, notifyVendor, actorFromUser } =
  vi.hoisted(() => ({
    reviewCreate: vi.fn(),
    recordActivity: vi.fn(),
    notifyVendor: vi.fn(),
    actorFromUser: vi.fn(() => ({ id: "admin-1", name: "Ada Admin", role: "SUPER_ADMIN" })),
  }));

vi.mock("@/models/storeReview.model", () => ({
  default: { create: reviewCreate },
}));
vi.mock("@/lib/activity", () => ({ recordActivity, actorFromUser }));
vi.mock("@/services/notifications/notify", () => ({ notifyVendor }));

import {
  assertStoreAction,
  assertStoreApprovalReady,
  canPerformStoreAction,
  getStoreApprovalReadiness,
  performStoreAction,
  type StoreAction,
} from "@/services/store/workflow";

const admin = {
  _id: "admin-1",
  name: "Ada Admin",
  role: "admin",
  adminRole: "SUPER_ADMIN",
};

const completeStore = (overrides: Record<string, unknown> = {}) => ({
  _id: "store-1",
  owner: "vendor-1",
  name: "Amaka Fabrics",
  status: "pending",
  businessType: "limited_company",
  cacRegistrationNumber: "RC123456",
  tin: "12345678",
  rejectionReason: null,
  suspensionReason: null,
  suspendedAt: null,
  suspendedBy: null,
  reviewedAt: null,
  reviewedBy: null,
  documents: [
    { type: "government_id", url: "https://example.com/id.pdf" },
    { type: "utility_bill", url: "https://example.com/bill.pdf" },
    { type: "cac_certificate", url: "https://example.com/cac.pdf" },
  ],
  representative: { nin: "12345678901", bvn: null },
  settlementAccount: { accountNumber: "1234567890" },
  compliance: { termsAccepted: true, dataProcessingConsent: true },
  save: vi.fn(),
  ...overrides,
});

describe("store approval readiness", () => {
  it("accepts a complete registered-business store", () => {
    const readiness = getStoreApprovalReadiness(completeStore() as never);

    expect(readiness).toEqual({ ready: true, missing: [] });
  });

  it("lists every missing KYB requirement", () => {
    const readiness = getStoreApprovalReadiness(
      completeStore({
        cacRegistrationNumber: null,
        tin: null,
        documents: [],
        representative: { nin: null, bvn: null },
        settlementAccount: {},
        compliance: {},
      }) as never,
    );

    expect(readiness.ready).toBe(false);
    expect(readiness.missing).toEqual(
      expect.arrayContaining([
        "Government-issued ID document",
        "Utility bill or proof of address",
        "CAC registration number",
        "Tax identification number",
        "CAC certificate",
        "Representative NIN or BVN",
        "Settlement bank account",
        "Marketplace terms and data-processing consent",
      ]),
    );
  });

  it("does not require CAC details for an individual business", () => {
    const readiness = getStoreApprovalReadiness(
      completeStore({
        businessType: "individual",
        cacRegistrationNumber: null,
        tin: null,
        documents: [
          { type: "government_id", url: "https://example.com/id.pdf" },
          { type: "utility_bill", url: "https://example.com/bill.pdf" },
        ],
      }) as never,
    );

    expect(readiness.ready).toBe(true);
  });

  it("throws a 400 when approval requirements are missing", () => {
    try {
      assertStoreApprovalReady(
        completeStore({ documents: [], tin: null }) as never,
      );
      throw new Error("expected readiness check to fail");
    } catch (error) {
      expect((error as CustomError).statusCode).toBe(400);
      expect((error as CustomError).message).toContain(
        "cannot be approved yet",
      );
    }
  });
});

describe("store status transitions", () => {
  it("allows approval from pending and under review only", () => {
    expect(canPerformStoreAction("pending", "approve")).toBe(true);
    expect(canPerformStoreAction("under_review", "approve")).toBe(true);
    expect(canPerformStoreAction("approved", "approve")).toBe(false);
    expect(canPerformStoreAction("rejected", "approve")).toBe(false);
  });

  it("only suspends approved stores and only reactivates suspended stores", () => {
    expect(canPerformStoreAction("approved", "suspend")).toBe(true);
    expect(canPerformStoreAction("pending", "suspend")).toBe(false);
    expect(canPerformStoreAction("suspended", "reactivate")).toBe(true);
    expect(canPerformStoreAction("approved", "reactivate")).toBe(false);
  });

  it("rejects illegal transitions with a 400", () => {
    try {
      assertStoreAction("approved", "approve");
      throw new Error("expected transition check to fail");
    } catch (error) {
      expect((error as CustomError).statusCode).toBe(400);
    }
  });
});

describe("performStoreAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reviewCreate.mockResolvedValue({ _id: "review-1" });
  });

  const run = (store: ReturnType<typeof completeStore>, action: StoreAction, extra = {}) =>
    performStoreAction({
      store: store as never,
      action,
      actor: admin,
      ...extra,
    });

  it("approves a ready store and records the full trail", async () => {
    const store = completeStore();

    const result = await run(store, "approve", { note: "KYB verified" });

    expect(result.fromStatus).toBe("pending");
    expect(result.toStatus).toBe("approved");
    expect(store.status).toBe("approved");
    expect(store.save).toHaveBeenCalledTimes(1);
    expect(reviewCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        store: "store-1",
        action: "approved",
        fromStatus: "pending",
        toStatus: "approved",
        actor: "admin-1",
        actorRole: "admin",
        metadata: { note: "KYB verified" },
      }),
    );
    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "store_approved",
        subject: expect.objectContaining({ type: "store", id: "store-1" }),
      }),
    );
    expect(notifyVendor).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: "vendor-1",
        type: "store_approved",
        metadata: expect.objectContaining({ status: "approved" }),
      }),
    );
  });

  it("blocks a duplicate approval without saving or notifying", async () => {
    const store = completeStore({ status: "approved" });

    await expect(run(store, "approve")).rejects.toMatchObject({
      statusCode: 400,
    });

    expect(store.save).not.toHaveBeenCalled();
    expect(reviewCreate).not.toHaveBeenCalled();
    expect(notifyVendor).not.toHaveBeenCalled();
  });

  it("blocks approval while KYB documents are missing", async () => {
    const store = completeStore({ documents: [] });

    await expect(run(store, "approve")).rejects.toMatchObject({
      statusCode: 400,
    });

    expect(store.save).not.toHaveBeenCalled();
  });

  it("rejects with a reason and notifies the vendor", async () => {
    const store = completeStore();

    await run(store, "reject", { reason: "CAC certificate is unreadable" });

    expect(store.status).toBe("rejected");
    expect(store.rejectionReason).toBe("CAC certificate is unreadable");
    expect(notifyVendor).toHaveBeenCalledWith(
      expect.objectContaining({ type: "store_rejected" }),
    );
  });

  it("requests information without leaving the review queue", async () => {
    const store = completeStore({ status: "under_review" });

    await run(store, "request_information", {
      message: "Upload a clearer utility bill",
    });

    expect(store.status).toBe("under_review");
    expect(reviewCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "information_requested",
        message: "Upload a clearer utility bill",
      }),
    );
    expect(notifyVendor).toHaveBeenCalledWith(
      expect.objectContaining({ type: "store_information_requested" }),
    );
  });

  it("suspends an approved store and reactivates it later", async () => {
    const store = completeStore({ status: "approved" });

    await run(store, "suspend", { reason: "Repeated policy violations" });

    expect(store.status).toBe("suspended");
    expect(store.suspensionReason).toBe("Repeated policy violations");
    expect(store.suspendedAt).toBeInstanceOf(Date);
    expect(notifyVendor).toHaveBeenCalledWith(
      expect.objectContaining({ type: "store_suspended" }),
    );

    await run(store, "reactivate", { note: "Appeal accepted" });

    expect(store.status).toBe("approved");
    expect(store.suspensionReason).toBeNull();
    expect(store.suspendedAt).toBeNull();
    expect(notifyVendor).toHaveBeenCalledWith(
      expect.objectContaining({ type: "store_reactivated" }),
    );
  });
});
