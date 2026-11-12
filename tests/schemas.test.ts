import { describe, expect, it } from "vitest";
import { registerSchema } from "@/schemas/auth";
import {
  adminInviteSchema,
  adminLoginSchema,
  adminPermissionsSchema,
  adminRoleSchema,
} from "@/schemas/admin";
import { createStoreSchema } from "@/schemas/store";
import { reviewStoreSchema, updateStoreSchema } from "@/schemas/store";
import { listStoresQuerySchema } from "@/schemas/store";
import { uploadFileSchema } from "@/schemas/upload";
import { buildStoreBody, validStoreBody } from "./fixtures/storePayload";

const registration = {
  name: "Ada Obi",
  username: "adaobi",
  email: "ada@example.com",
  password: "Password1!",
};

const fieldErrors = (result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) => result.error?.issues.map((issue) => issue.path.join(".")) ?? [];

describe("registerSchema", () => {
  it("defaults the role to user", () => {
    const parsed = registerSchema.parse(registration);

    expect(parsed.role).toBe("user");
  });

  it("allows vendor self-signup", () => {
    const parsed = registerSchema.parse({ ...registration, role: "vendor" });

    expect(parsed.role).toBe("vendor");
  });

  it("never allows admin self-signup", () => {
    const result = registerSchema.safeParse({ ...registration, role: "admin" });

    expect(result.success).toBe(false);
  });

  it("rejects weak passwords", () => {
    const result = registerSchema.safeParse({
      ...registration,
      password: "password",
    });

    expect(result.success).toBe(false);
    expect(fieldErrors(result)).toContain("password");
  });
});

describe("createStoreSchema", () => {
  it("accepts a complete registered-business onboarding payload", () => {
    const parsed = createStoreSchema.parse(validStoreBody);

    expect(parsed.businessType).toBe("limited_company");
    expect(parsed.location.type).toBe("Point");
    expect(parsed.address.country).toBe("Nigeria");
    expect(parsed.compliance.termsAccepted).toBe(true);
  });

  it("requires CAC and TIN for registered businesses", () => {
    const result = createStoreSchema.safeParse(
      buildStoreBody({ cacRegistrationNumber: undefined, tin: undefined }),
    );

    expect(result.success).toBe(false);
    expect(fieldErrors(result)).toEqual(
      expect.arrayContaining(["cacRegistrationNumber", "tin"]),
    );
  });

  it("requires government ID and proof of address documents", () => {
    const result = createStoreSchema.safeParse(
      buildStoreBody({
        documents: [
          { type: "cac_certificate", url: "https://example.com/cac.pdf" },
        ],
      }),
    );

    expect(result.success).toBe(false);
    expect(fieldErrors(result)).toContain("documents");
  });

  it("lets an individual business onboard without CAC documents", () => {
    const result = createStoreSchema.safeParse(
      buildStoreBody({
        businessType: "individual",
        cacRegistrationNumber: undefined,
        tin: undefined,
        documents: [
          { type: "government_id", url: "https://example.com/id.pdf" },
          { type: "utility_bill", url: "https://example.com/bill.pdf" },
        ],
      }),
    );

    expect(result.success).toBe(true);
  });

  it("requires the representative to be at least 18", () => {
    const currentYear = new Date().getFullYear();
    const result = createStoreSchema.safeParse(
      buildStoreBody({
        representative: {
          ...validStoreBody.representative,
          dateOfBirth: `${currentYear - 10}-01-01`,
        },
      }),
    );

    expect(result.success).toBe(false);
    expect(fieldErrors(result)).toContain("representative.dateOfBirth");
  });

  it("requires a NIN or BVN for the representative", () => {
    const result = createStoreSchema.safeParse(
      buildStoreBody({
        representative: {
          ...validStoreBody.representative,
          nin: undefined,
          bvn: undefined,
        },
      }),
    );

    expect(result.success).toBe(false);
    expect(fieldErrors(result)).toContain("representative.nin");
  });

  it("rejects duplicate operating days", () => {
    const result = createStoreSchema.safeParse(
      buildStoreBody({
        operatingHours: [
          validStoreBody.operatingHours[0],
          validStoreBody.operatingHours[0],
        ],
      }),
    );

    expect(result.success).toBe(false);
    expect(fieldErrors(result)).toContain("operatingHours");
  });

  it("rejects a closing time before the opening time", () => {
    const result = createStoreSchema.safeParse(
      buildStoreBody({
        operatingHours: [
          {
            day: "monday",
            isOpen: true,
            openingTime: "18:00",
            closingTime: "08:00",
          },
        ],
      }),
    );

    expect(result.success).toBe(false);
    expect(fieldErrors(result)).toContain("operatingHours.0.closingTime");
  });
});

describe("updateStoreSchema", () => {
  it("accepts partial updates", () => {
    const parsed = updateStoreSchema.parse({ name: "New Store Name" });

    expect(parsed.name).toBe("New Store Name");
  });
});

describe("reviewStoreSchema", () => {
  it("requires a rejection reason", () => {
    const result = reviewStoreSchema.safeParse({ status: "rejected" });

    expect(result.success).toBe(false);
    expect(fieldErrors(result)).toContain("rejectionReason");
  });

  it("accepts approval without a reason", () => {
    const parsed = reviewStoreSchema.parse({ status: "approved" });

    expect(parsed.status).toBe("approved");
  });
});

describe("listStoresQuerySchema", () => {
  it("coerces pagination query strings", () => {
    const parsed = listStoresQuerySchema.parse({ page: "2", limit: "10" });

    expect(parsed).toMatchObject({ page: 2, limit: 10 });
  });
});

describe("uploadFileSchema", () => {
  it("defaults to a store document and requires a document type", () => {
    const result = uploadFileSchema.safeParse({});

    expect(result.success).toBe(false);
    expect(fieldErrors(result)).toContain("documentType");
  });

  it("accepts a typed store document", () => {
    const parsed = uploadFileSchema.parse({
      purpose: "store_document",
      documentType: "cac_certificate",
    });

    expect(parsed.documentType).toBe("cac_certificate");
  });

  it("accepts images without a document type", () => {
    const parsed = uploadFileSchema.parse({ purpose: "store_logo" });

    expect(parsed.purpose).toBe("store_logo");
    expect(parsed.documentType).toBeUndefined();
  });

  it("rejects unknown purposes", () => {
    const result = uploadFileSchema.safeParse({ purpose: "avatar" });

    expect(result.success).toBe(false);
  });
});

describe("admin schemas", () => {
  it("validates admin login credentials", () => {
    expect(
      adminLoginSchema.safeParse({
        email: "admin@routiq.test",
        password: "Secret1!",
      }).success,
    ).toBe(true);
    expect(adminLoginSchema.safeParse({ email: "nope" }).success).toBe(false);
  });

  it("accepts documented and custom role keys but rejects malformed keys", () => {
    for (const adminRole of [
      "SUPER_ADMIN",
      "OPERATIONS_ADMIN",
      "FINANCE_ADMIN",
      "SUPPORT_ADMIN",
      "CATALOG_ADMIN",
      "CUSTOM_SUPPORT",
    ]) {
      expect(adminRoleSchema.safeParse({ adminRole }).success).toBe(true);
    }

    // Registry membership is checked by the controller; the schema rejects
    // malformed keys that could never be stored as a role.
    expect(adminRoleSchema.safeParse({ adminRole: "SUPER ADMIN" }).success).toBe(
      false,
    );
    expect(adminRoleSchema.safeParse({ adminRole: "1ADMIN" }).success).toBe(
      false,
    );
  });

  it("requires a name, email and role to invite an admin", () => {
    expect(
      adminInviteSchema.safeParse({
        name: "Ada Obi",
        email: "ada@routiq.test",
        adminRole: "SUPPORT_ADMIN",
      }).success,
    ).toBe(true);
    expect(
      adminInviteSchema.safeParse({
        name: "Ada Obi",
        email: "ada@routiq.test",
      }).success,
    ).toBe(false);
  });

  it("rejects unknown permissions in per-admin overrides", () => {
    expect(
      adminPermissionsSchema.safeParse({
        grants: ["orders.view"],
        revocations: ["transactions.view"],
      }).success,
    ).toBe(true);
    expect(
      adminPermissionsSchema.safeParse({ grants: ["orders.destroy"] }).success,
    ).toBe(false);
  });
});
