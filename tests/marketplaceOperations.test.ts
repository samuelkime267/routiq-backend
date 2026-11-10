import { describe, expect, it } from "vitest";
import { hasPermission } from "@/config/permissions";
import {
  disputeCategoryFor,
  disputeStatusVariants,
  normalizeDisputeStatus,
} from "@/models/dispute.model";
import {
  listUsersQuerySchema,
  updateUserStatusSchema,
} from "@/schemas/user";
import {
  assignDisputeSchema,
  resolveDisputeSchema,
  updateDisputeStatusSchema,
} from "@/schemas/dispute";
import { listTransactionsQuerySchema } from "@/schemas/transaction";
import { classifyReconciliation } from "@/services/financials/query";
import {
  availableHeld,
  releaseStatusFor,
} from "@/services/escrow/query";
import { transactionTypeFor } from "@/services/transactions/query";
import { canTransitionDispute } from "@/services/disputes/query";

describe("user management schemas", () => {
  it("accepts role and its type alias plus registration-date filters", () => {
    const parsed = listUsersQuerySchema.parse({
      type: "vendor",
      status: "suspended",
      createdFrom: "2026-01-01",
      createdTo: "2026-06-30",
      sortBy: "name",
      sortOrder: "asc",
      page: "2",
      limit: "50",
    });

    expect(parsed).toMatchObject({
      type: "vendor",
      status: "suspended",
      createdFrom: "2026-01-01",
      createdTo: "2026-06-30",
      sortBy: "name",
      sortOrder: "asc",
      page: 2,
      limit: 50,
    });
  });

  it("defaults pagination and sorting", () => {
    const parsed = listUsersQuerySchema.parse({});

    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(20);
    expect(parsed.sortBy).toBe("createdAt");
    expect(parsed.sortOrder).toBe("desc");
  });

  it("rejects an unknown account status", () => {
    expect(
      listUsersQuerySchema.safeParse({ status: "deleted" }).success,
    ).toBe(false);
  });

  it("requires a reason for suspension", () => {
    expect(
      updateUserStatusSchema.safeParse({ status: "suspended" }).success,
    ).toBe(false);
    expect(
      updateUserStatusSchema.safeParse({
        status: "suspended",
        reason: "Fraudulent activity",
      }).success,
    ).toBe(true);
  });

  it("allows reactivation without a reason", () => {
    expect(
      updateUserStatusSchema.safeParse({ status: "active" }).success,
    ).toBe(true);
  });
});

describe("user and financial permissions", () => {
  it("grants account management to support and operations", () => {
    expect(
      hasPermission({ adminRole: "SUPPORT_ADMIN" }, "users.manage"),
    ).toBe(true);
    expect(
      hasPermission({ adminRole: "OPERATIONS_ADMIN" }, "users.manage"),
    ).toBe(true);
    expect(hasPermission({ adminRole: "FINANCE_ADMIN" }, "users.manage")).toBe(
      false,
    );
  });

  it("grants financial reporting to finance only", () => {
    expect(
      hasPermission({ adminRole: "FINANCE_ADMIN" }, "financials.view"),
    ).toBe(true);
    expect(
      hasPermission({ adminRole: "SUPPORT_ADMIN" }, "financials.view"),
    ).toBe(false);
  });

  it("honours per-admin revocations", () => {
    expect(
      hasPermission(
        {
          adminRole: "SUPPORT_ADMIN",
          permissionRevocations: ["users.manage"],
        },
        "users.manage",
      ),
    ).toBe(false);
  });
});

describe("transaction retrieval helpers", () => {
  it("derives transaction type from the payment status", () => {
    expect(transactionTypeFor("successful")).toBe("payment");
    expect(transactionTypeFor("pending")).toBe("payment");
    expect(transactionTypeFor("refunded")).toBe("refund");
  });

  it("parses the full transaction filter set", () => {
    const parsed = listTransactionsQuerySchema.parse({
      type: "refund",
      status: "refunded",
      channel: "card",
      customer: "ada@example.com",
      vendor: "Store One",
      order: "RQ-100",
      createdFrom: "2026-01-01",
      createdTo: "2026-01-31",
    });

    expect(parsed.type).toBe("refund");
    expect(parsed.channel).toBe("card");
    expect(parsed.customer).toBe("ada@example.com");
  });
});

describe("escrow accuracy helpers", () => {
  it("reports the available held balance without double counting", () => {
    expect(
      availableHeld({
        amountHeld: 10000,
        amountReleased: 4000,
        amountRefunded: 1000,
      }),
    ).toBe(5000);
    expect(
      availableHeld({
        amountHeld: 1000,
        amountReleased: 1200,
        amountRefunded: 0,
      }),
    ).toBe(0);
  });

  it("derives release status from the ledger status and due date", () => {
    const now = new Date("2026-11-09T12:00:00.000Z").getTime();

    expect(releaseStatusFor({ status: "released" }, now)).toBe("released");
    expect(releaseStatusFor({ status: "refunded" }, now)).toBe("refunded");
    expect(
      releaseStatusFor(
        {
          status: "held",
          releaseDueAt: new Date("2026-11-01T12:00:00.000Z"),
        },
        now,
      ),
    ).toBe("due");
    expect(
      releaseStatusFor(
        {
          status: "held",
          releaseDueAt: new Date("2026-11-20T12:00:00.000Z"),
        },
        now,
      ),
    ).toBe("scheduled");
  });
});

describe("reconciliation classification", () => {
  const payment = { status: "successful", vendorAmount: 9250 };

  it("marks a payment with no escrow ledger record as missing", () => {
    expect(classifyReconciliation(payment, null)).toBe("missing");
  });

  it("marks an equal escrow record as matched", () => {
    expect(
      classifyReconciliation(payment, {
        status: "held",
        amountHeld: 9250,
      }),
    ).toBe("matched");
  });

  it("detects an amount mismatch", () => {
    expect(
      classifyReconciliation(payment, {
        status: "held",
        amountHeld: 9000,
      }),
    ).toBe("amount_mismatch");
  });

  it("detects a refunded payment whose escrow was not refunded", () => {
    expect(
      classifyReconciliation(
        { status: "refunded", vendorAmount: 9250 },
        { status: "held", amountHeld: 9250 },
      ),
    ).toBe("status_mismatch");
  });

  it("accepts released escrow for a successful payment", () => {
    expect(
      classifyReconciliation(payment, {
        status: "released",
        amountHeld: 9250,
      }),
    ).toBe("matched");
  });
});

describe("dispute lifecycle", () => {
  it("normalises legacy lowercase statuses", () => {
    expect(normalizeDisputeStatus("open")).toBe("OPEN");
    expect(normalizeDisputeStatus("investigating")).toBe("UNDER_REVIEW");
    expect(normalizeDisputeStatus("resolved")).toBe("RESOLVED");
    expect(normalizeDisputeStatus("unknown")).toBeNull();
  });

  it("queries both canonical and legacy values", () => {
    expect(disputeStatusVariants("OPEN")).toEqual(
      expect.arrayContaining(["OPEN", "open"]),
    );
    expect(disputeStatusVariants("UNDER_REVIEW")).toEqual(
      expect.arrayContaining(["UNDER_REVIEW", "investigating"]),
    );
  });

  it("maps legacy dispute types onto the five categories", () => {
    expect(disputeCategoryFor("refund")).toBe("payment");
    expect(disputeCategoryFor("non_delivery")).toBe("delivery");
    expect(disputeCategoryFor("damaged_item")).toBe("product");
    expect(disputeCategoryFor("weird", "vendor")).toBe("vendor");
    expect(disputeCategoryFor(null, null)).toBe("order");
  });

  it("only permits legal status transitions", () => {
    expect(canTransitionDispute("OPEN", "UNDER_REVIEW")).toBe(true);
    expect(canTransitionDispute("OPEN", "RESOLVED")).toBe(true);
    expect(canTransitionDispute("RESOLVED", "CLOSED")).toBe(true);
    expect(canTransitionDispute("CLOSED", "OPEN")).toBe(false);
    expect(canTransitionDispute("RESOLVED", "UNDER_REVIEW")).toBe(false);
  });

  it("requires a message when requesting information", () => {
    expect(
      updateDisputeStatusSchema.safeParse({
        status: "AWAITING_INFORMATION",
      }).success,
    ).toBe(false);
    expect(
      updateDisputeStatusSchema.safeParse({
        status: "AWAITING_INFORMATION",
        message: "Please send a photo of the damaged item.",
      }).success,
    ).toBe(true);
  });

  it("requires a resolution when resolving", () => {
    expect(
      updateDisputeStatusSchema.safeParse({ status: "RESOLVED" }).success,
    ).toBe(false);
    expect(
      resolveDisputeSchema.safeParse({ resolution: "Refund" }).success,
    ).toBe(false);
    expect(
      resolveDisputeSchema.safeParse({
        resolution: "Refund issued after vendor review.",
      }).success,
    ).toBe(true);
  });

  it("accepts an optional assignee and defaults to self", () => {
    expect(assignDisputeSchema.parse({})).toEqual({});
    expect(
      assignDisputeSchema.safeParse({ adminId: "not-an-id" }).success,
    ).toBe(false);
  });
});
