import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/models/user.model", () => ({
  default: { findOne: vi.fn() },
}));
vi.mock("@/models/dispute.model", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/models/dispute.model")>();

  return {
    ...actual,
    default: { findById: vi.fn() },
  };
});
vi.mock("@/lib/activity", () => ({
  actorFromUser: vi.fn((user: { name?: string }) => ({
    id: "admin-1",
    name: user?.name ?? "Admin",
    role: "SUPER_ADMIN",
  })),
  recordActivity: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/services/notifications/notify", () => ({
  notifyVendor: vi.fn().mockResolvedValue(undefined),
}));

import User from "@/models/user.model";
import Dispute from "@/models/dispute.model";
import { recordActivity } from "@/lib/activity";
import { notifyVendor } from "@/services/notifications/notify";
import { updateUserStatus } from "@/controllers/user/updateUserStatus";
import {
  assignDispute,
  updateDisputeStatus,
} from "@/services/disputes/query";

const runController = async (
  handler: (req: never, res: never, next: never) => Promise<void>,
  overrides: Partial<{ body: Record<string, unknown>; params: Record<string, string>; user: unknown }> = {},
) => {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const next = vi.fn();
  const req = {
    user: overrides.user ?? {
      _id: "admin-1",
      name: "Super Admin",
      role: "admin",
      adminRole: "SUPER_ADMIN",
      adminStatus: "ACTIVE",
    },
    params: overrides.params ?? { userId: "user-1" },
    body: overrides.body ?? {},
  };

  await handler(req as never, { status } as never, next as never);

  return { status, json, next };
};

const admin = {
  _id: "admin-1",
  name: "Super Admin",
  role: "admin",
  adminRole: "SUPER_ADMIN" as const,
  adminStatus: "ACTIVE" as const,
};

const account = (role: "user" | "vendor" = "user") => {
  const doc = {
    _id: "user-1",
    name: "Ada Obi",
    email: "ada@example.com",
    role,
    status: "active" as string,
    suspensionReason: null as string | null,
    suspendedAt: null as Date | null,
    suspendedBy: null as unknown,
    updatedAt: null as Date | null,
    save: vi.fn().mockResolvedValue(undefined),
  };

  return doc;
};

describe("account suspension", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("suspends a customer account and records the audit event", async () => {
    const user = account("user");
    vi.mocked(User.findOne).mockResolvedValueOnce(user as never);

    const { status, json } = await runController(updateUserStatus, {
      body: { status: "suspended", reason: "Fraudulent activity" },
    });

    expect(User.findOne).toHaveBeenCalledWith({
      _id: "user-1",
      role: { $in: ["user", "vendor"] },
    });
    expect(user.status).toBe("suspended");
    expect(user.suspensionReason).toBe("Fraudulent activity");
    expect(user.suspendedAt).toBeInstanceOf(Date);
    expect(user.save).toHaveBeenCalled();

    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "admin_action",
        subject: expect.objectContaining({ type: "user" }),
        metadata: expect.objectContaining({
          fromStatus: "active",
          toStatus: "suspended",
          reason: "Fraudulent activity",
        }),
      }),
    );
    expect(notifyVendor).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );
  });

  it("reactivates a vendor and notifies the vendor", async () => {
    const user = account("vendor");
    user.status = "suspended";
    user.suspensionReason = "Policy breach";
    vi.mocked(User.findOne).mockResolvedValueOnce(user as never);

    const { json } = await runController(updateUserStatus, {
      body: { status: "active" },
    });

    expect(user.status).toBe("active");
    expect(user.suspensionReason).toBeNull();
    expect(notifyVendor).toHaveBeenCalledWith(
      expect.objectContaining({ type: "vendor_reactivated" }),
    );
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );
  });

  it("cannot suspend an administrative account through the user route", async () => {
    vi.mocked(User.findOne).mockResolvedValueOnce(null);

    const { next, status } = await runController(updateUserStatus, {
      body: { status: "suspended", reason: "Policy breach" },
    });

    expect(status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404 }),
    );
  });
});

const DISPUTE_ID = "64b000000000000000000001";

const disputeDoc = (status = "OPEN") => {
  const doc = {
    _id: DISPUTE_ID,
    reference: "DSP-3000",
    status,
    assignedTo: null as string | null,
    assignedBy: null as string | null,
    assignedAt: null as Date | null,
    informationRequest: null as string | null,
    resolution: null as string | null,
    resolvedAt: null as Date | null,
    closedAt: null as Date | null,
    updatedAt: null as Date | null,
    history: [] as Array<Record<string, unknown>>,
    notes: [] as Array<Record<string, unknown>>,
    save: vi.fn().mockResolvedValue(undefined),
  };

  return doc;
};

describe("dispute operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("assigns a dispute to the acting administrator by default", async () => {
    const dispute = disputeDoc();
    vi.mocked(Dispute.findById).mockResolvedValueOnce(dispute as never);
    vi.mocked(User.findOne).mockReturnValueOnce({
      select: vi.fn().mockResolvedValue({
        _id: "admin-1",
        name: "Super Admin",
      }),
    } as never);

    await assignDispute(DISPUTE_ID, admin, {});

    expect(dispute.assignedTo).toBe("admin-1");
    expect(dispute.history).toHaveLength(1);
    expect(dispute.history[0]).toMatchObject({ action: "assigned" });
    expect(dispute.save).toHaveBeenCalled();
    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.objectContaining({ type: "dispute" }),
      }),
    );
  });

  it("rejects an illegal status transition without saving", async () => {
    const dispute = disputeDoc("RESOLVED");
    vi.mocked(Dispute.findById).mockResolvedValueOnce(dispute as never);

    await expect(
      updateDisputeStatus(DISPUTE_ID, admin, {
        status: "UNDER_REVIEW",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(dispute.save).not.toHaveBeenCalled();
  });

  it("records an information request in the history", async () => {
    const dispute = disputeDoc("UNDER_REVIEW");
    vi.mocked(Dispute.findById).mockResolvedValueOnce(dispute as never);

    await updateDisputeStatus(DISPUTE_ID, admin, {
      status: "AWAITING_INFORMATION",
      message: "Please upload a photo of the damaged item.",
    });

    expect(dispute.status).toBe("AWAITING_INFORMATION");
    expect(dispute.informationRequest).toBe(
      "Please upload a photo of the damaged item.",
    );
    expect(dispute.history[0]).toMatchObject({
      action: "information_requested",
      fromStatus: "UNDER_REVIEW",
      toStatus: "AWAITING_INFORMATION",
    });
    expect(dispute.save).toHaveBeenCalled();
  });

  it("records a resolution and never touches financial records", async () => {
    const dispute = disputeDoc("OPEN");
    vi.mocked(Dispute.findById).mockResolvedValueOnce(dispute as never);

    await updateDisputeStatus(DISPUTE_ID, admin, {
      status: "RESOLVED",
      resolution: "Refund approved after vendor review.",
    });

    expect(dispute.status).toBe("RESOLVED");
    expect(dispute.resolvedAt).toBeInstanceOf(Date);
    expect(dispute.history[0]).toMatchObject({
      action: "resolved",
      toStatus: "RESOLVED",
    });
    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ escrowModified: false }),
      }),
    );
  });
});
