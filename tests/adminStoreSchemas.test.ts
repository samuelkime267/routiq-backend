import { describe, expect, it } from "vitest";
import {
  approveStoreSchema,
  reactivateStoreSchema,
  rejectStoreSchema,
  requestStoreInformationSchema,
  suspendStoreSchema,
} from "@/schemas/store";
import {
  createVendorNoteSchema,
  vendorStatusSchema,
} from "@/schemas/vendor";
import {
  buildVendorNotification,
} from "@/services/notifications/notify";

const paths = (result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[] }[] };
}) => result.error?.issues.map((issue) => issue.path.join(".")) ?? [];

describe("store action schemas", () => {
  it("accepts an approval with or without a note", () => {
    expect(approveStoreSchema.safeParse({}).success).toBe(true);
    expect(
      approveStoreSchema.safeParse({ note: "Documents verified" }).success,
    ).toBe(true);
  });

  it("requires a reason to reject a store", () => {
    const result = rejectStoreSchema.safeParse({});

    expect(result.success).toBe(false);
    expect(paths(result)).toContain("reason");
  });

  it("requires a meaningful information request", () => {
    expect(
      requestStoreInformationSchema.safeParse({ message: "More" }).success,
    ).toBe(false);
    expect(
      requestStoreInformationSchema.safeParse({
        message: "Please upload a clearer CAC certificate",
      }).success,
    ).toBe(true);
  });

  it("requires a suspension reason", () => {
    const result = suspendStoreSchema.safeParse({ reason: "bad" });

    expect(result.success).toBe(false);
    expect(paths(result)).toContain("reason");
  });

  it("allows reactivation without a note", () => {
    expect(reactivateStoreSchema.safeParse({}).success).toBe(true);
  });
});

describe("vendor management schemas", () => {
  it("requires a reason when suspending a vendor", () => {
    const result = vendorStatusSchema.safeParse({ status: "suspended" });

    expect(result.success).toBe(false);
    expect(paths(result)).toContain("reason");
  });

  it("reactivates without a reason", () => {
    expect(vendorStatusSchema.safeParse({ status: "active" }).success).toBe(
      true,
    );
  });

  it("validates a note body and optional store id", () => {
    expect(
      createVendorNoteSchema.safeParse({ body: "Spoke with the vendor" })
        .success,
    ).toBe(true);
    expect(
      createVendorNoteSchema.safeParse({
        body: "Spoke with the vendor",
        storeId: "not-an-object-id",
      }).success,
    ).toBe(false);
  });
});

describe("buildVendorNotification", () => {
  it("fills optional fields and starts unread", () => {
    const payload = buildVendorNotification({
      recipient: "vendor-1",
      type: "store_approved",
      title: "Your store is approved",
      message: "You can start selling.",
    });

    expect(payload).toMatchObject({
      recipient: "vendor-1",
      href: null,
      metadata: {},
      readAt: null,
    });
  });
});
