import { afterEach, describe, expect, it } from "vitest";
import {
  PERMISSIONS,
  isAdminRole,
  listRoleDefinitions,
  permissionsForAdmin,
  permissionsForRole,
  resetRoleDefinitions,
  roleDefinitionFor,
  setRoleDefinitions,
  type Permission,
} from "@/config/permissions";
import type { CustomError } from "@/types";
import type { AdminInvitationDocument } from "@/models/adminInvitation.model";
import {
  acceptAdminInvitationSchema,
  adminInviteSchema,
  adminPermissionsSchema,
  listAdminsQuerySchema,
} from "@/schemas/admin";
import { listAuditLogsQuerySchema } from "@/schemas/audit";
import { updateSettingsSchema } from "@/schemas/settings";
import {
  DEFAULT_SETTINGS,
  normaliseSettings,
} from "@/services/settings";
import { serialiseAdminInvitation } from "@/services/admins/invitations";
import {
  auditActorFromUser,
  recordAudit,
  requestMetadata,
} from "@/lib/audit";
import {
  assertCanAssignAdminRole,
  assertCanChangeAdminStatus,
  assertCanGrantPermissions,
  assertCanInviteAdmin,
} from "@/utils/adminAccess";

const admin = (overrides: Record<string, unknown> = {}) => ({
  _id: "507f1f77bcf86cd799439011",
  role: "admin",
  status: "active",
  adminRole: "SUPER_ADMIN" as string | null,
  adminStatus: "ACTIVE" as string | null,
  permissionGrants: [] as Permission[],
  permissionRevocations: [] as Permission[],
  ...overrides,
});

const errorOf = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    return error as CustomError;
  }

  throw new Error("Expected the guard to throw");
};

afterEach(() => {
  resetRoleDefinitions();
});

describe("admin role registry", () => {
  it("exposes the five built-in roles by default", () => {
    const keys = listRoleDefinitions().map((role) => role.key);

    expect(keys).toEqual([
      "SUPER_ADMIN",
      "OPERATIONS_ADMIN",
      "FINANCE_ADMIN",
      "SUPPORT_ADMIN",
      "CATALOG_ADMIN",
    ]);
    expect(isAdminRole("SUPPORT_ADMIN")).toBe(true);
    expect(isAdminRole("REGIONAL_SUPPORT")).toBe(false);
  });

  it("registers persisted custom roles at runtime", () => {
    setRoleDefinitions([
      {
        key: "REGIONAL_SUPPORT",
        label: "Regional Support",
        description: "Handles regional customer issues.",
        permissions: ["dashboard.view", "disputes.view"],
        system: false,
      },
    ]);

    expect(roleDefinitionFor("REGIONAL_SUPPORT")?.label).toBe(
      "Regional Support",
    );
    expect(permissionsForRole("REGIONAL_SUPPORT")).toEqual([
      "dashboard.view",
      "disputes.view",
    ]);
    expect(isAdminRole("REGIONAL_SUPPORT")).toBe(true);
  });

  it("forces SUPER_ADMIN to the full permission set", () => {
    setRoleDefinitions([
      {
        key: "SUPER_ADMIN",
        label: "Super Admin",
        description: "attempted restriction",
        permissions: ["dashboard.view"],
        system: true,
      },
    ]);

    expect(permissionsForRole("SUPER_ADMIN").sort()).toEqual(
      [...PERMISSIONS].sort(),
    );
  });

  it("drops unknown permissions from persisted definitions", () => {
    setRoleDefinitions([
      {
        key: "CUSTOM_AUDITOR",
        label: "Custom Auditor",
        description: "",
        permissions: ["dashboard.view", "made.up" as Permission],
        system: false,
      },
    ]);

    expect(permissionsForRole("CUSTOM_AUDITOR")).toEqual(["dashboard.view"]);
  });

  it("applies grants and revocations on top of the role", () => {
    const subject = {
      adminRole: "SUPPORT_ADMIN",
      permissionGrants: ["audit_logs.view"] as Permission[],
      permissionRevocations: ["users.manage"] as Permission[],
    };

    const effective = permissionsForAdmin(subject);

    expect(effective).toContain("audit_logs.view");
    expect(effective).not.toContain("users.manage");
    expect(effective).toContain("disputes.manage");
  });

  it("returns no permissions for an account without an admin role", () => {
    expect(permissionsForAdmin({ adminRole: null })).toEqual([]);
  });
});

describe("invitation and role-assignment guards", () => {
  it("lets a Super Admin invite any role", () => {
    expect(() =>
      assertCanInviteAdmin(admin(), "SUPER_ADMIN"),
    ).not.toThrow();
  });

  it("stops a non-Super Admin from inviting a Super Admin", () => {
    expect(
      errorOf(() =>
        assertCanInviteAdmin(
          admin({
            adminRole: "OPERATIONS_ADMIN",
            permissionGrants: ["admins.invite"],
          }),
          "SUPER_ADMIN",
        ),
      ).statusCode,
    ).toBe(403);
  });

  it("stops an inviter from issuing a role with permissions they lack", () => {
    expect(
      errorOf(() =>
        assertCanInviteAdmin(
          admin({
            adminRole: "OPERATIONS_ADMIN",
            permissionGrants: ["admins.invite"],
          }),
          "FINANCE_ADMIN",
        ),
      ).message,
    ).toContain("permissions you do not hold");
  });

  it("rejects an unknown role key", () => {
    expect(
      errorOf(() => assertCanAssignAdminRole(admin(), "GHOST_ROLE")).statusCode,
    ).toBe(400);
  });

  it("allows assigning a custom role that stays within the actor's access", () => {
    setRoleDefinitions([
      {
        key: "DISPUTE_REVIEWER",
        label: "Dispute Reviewer",
        description: "",
        permissions: ["dashboard.view", "disputes.view"],
        system: false,
      },
    ]);

    expect(() =>
      assertCanAssignAdminRole(
        admin({
          adminRole: "SUPPORT_ADMIN",
          permissionGrants: ["roles.manage"],
        }),
        "DISPUTE_REVIEWER",
      ),
    ).not.toThrow();
  });

  it("blocks a non-Super Admin from granting permissions they do not hold", () => {
    expect(
      errorOf(() =>
        assertCanGrantPermissions(admin({ adminRole: "SUPPORT_ADMIN" }), [
          "settings.manage",
        ]),
      ).statusCode,
    ).toBe(403);
  });

  it("protects the last active Super Admin from demotion", () => {
    const actor = admin({ _id: "507f1f77bcf86cd799439012" });
    const target = admin({ _id: "507f1f77bcf86cd799439013" });

    expect(() =>
      assertCanChangeAdminStatus(actor, target, "SUSPENDED", 1),
    ).toThrowError(/at least one active super admin/i);
  });
});

describe("admin invitation serialisation", () => {
  const buildInvitation = (overrides: Record<string, unknown> = {}) => {
    const document = {
      _id: "507f1f77bcf86cd799439014",
      admin: "507f1f77bcf86cd799439015",
      name: "Ada Admin",
      email: "ada@routiq.ng",
      adminRole: "OPERATIONS_ADMIN",
      tokenHash: "super-secret-hash",
      status: "PENDING",
      expiresAt: new Date("2026-11-20T10:00:00.000Z"),
      invitedBy: "507f1f77bcf86cd799439011",
      acceptedAt: null,
      revokedAt: null,
      revokedBy: null,
      lastSentAt: new Date("2026-11-13T10:00:00.000Z"),
      sendCount: 2,
      createdAt: new Date("2026-11-13T09:59:00.000Z"),
      updatedAt: new Date("2026-11-13T10:00:00.000Z"),
      ...overrides,
    };

    return {
      toObject: () => ({ ...document }),
    } as unknown as AdminInvitationDocument;
  };

  it("never exposes the stored token hash", () => {
    const view = serialiseAdminInvitation(buildInvitation());

    expect(view).not.toHaveProperty("tokenHash");
    expect(JSON.stringify(view)).not.toContain("super-secret-hash");
  });

  it("normalises dates and counts", () => {
    const view = serialiseAdminInvitation(buildInvitation());

    expect(view.expiresAt).toBe("2026-11-20T10:00:00.000Z");
    expect(view.lastSentAt).toBe("2026-11-13T10:00:00.000Z");
    expect(view.sendCount).toBe(2);
  });

  it("flags expired invitations using the server clock", () => {
    const view = serialiseAdminInvitation(
      buildInvitation({ expiresAt: new Date("2020-01-01T00:00:00.000Z") }),
    );

    expect(view.isExpired).toBe(true);
  });

  it("does not flag a future expiry as expired", () => {
    const view = serialiseAdminInvitation(
      buildInvitation({ expiresAt: new Date("2099-01-01T00:00:00.000Z") }),
    );

    expect(view.isExpired).toBe(false);
  });
});

describe("platform settings", () => {
  it("falls back to defaults when nothing is stored", () => {
    const settings = normaliseSettings(null);

    expect(settings.marketplace.name).toBe("Routiq");
    expect(settings.commission.ratePercent).toBe(
      DEFAULT_SETTINGS.commission.ratePercent,
    );
    expect(settings.security.invitationExpiryHours).toBe(168);
    expect(settings.updatedBy).toBeNull();
    expect(settings.updatedAt).toBeNull();
  });

  it("merges partial stored groups with defaults", () => {
    const settings = normaliseSettings({
      marketplace: { name: "Routiq NG" },
      commission: { ratePercent: 9 },
      updatedAt: "2026-11-13T10:00:00.000Z",
      updatedBy: "507f1f77bcf86cd799439011",
    });

    expect(settings.marketplace.name).toBe("Routiq NG");
    expect(settings.marketplace.currency).toBe("NGN");
    expect(settings.marketplace.timezone).toBe("Africa/Lagos");
    expect(settings.commission.ratePercent).toBe(9);
    expect(settings.updatedAt).toBe("2026-11-13T10:00:00.000Z");
    expect(settings.updatedBy).toBe("507f1f77bcf86cd799439011");
  });

  it("always marks commission as non-retroactive", () => {
    const settings = normaliseSettings({
      commission: { ratePercent: 12, appliesToRecordedPayments: true },
    });

    expect(settings.commission.appliesToRecordedPayments).toBe(false);
  });

  it("restores the default categories when the stored list is empty", () => {
    const settings = normaliseSettings({ productCategories: [] });

    expect(settings.productCategories).toEqual([
      ...DEFAULT_SETTINGS.productCategories,
    ]);
  });

  it("keeps a stored category list", () => {
    const settings = normaliseSettings({
      productCategories: ["Groceries", "Pharmacy"],
    });

    expect(settings.productCategories).toEqual(["Groceries", "Pharmacy"]);
  });
});

describe("settings validation", () => {
  it("rejects an empty update", () => {
    expect(updateSettingsSchema.safeParse({}).success).toBe(false);
  });

  it("rejects unknown nested keys", () => {
    const result = updateSettingsSchema.safeParse({
      commission: { ratePercent: 5, backdate: true },
    });

    expect(result.success).toBe(false);
  });

  it("rejects a commission outside 0–50%", () => {
    expect(
      updateSettingsSchema.safeParse({ commission: { ratePercent: 51 } })
        .success,
    ).toBe(false);
    expect(
      updateSettingsSchema.safeParse({ commission: { ratePercent: -1 } })
        .success,
    ).toBe(false);
  });

  it("de-duplicates product categories", () => {
    const result = updateSettingsSchema.safeParse({
      productCategories: ["Groceries", "Groceries", "Fashion"],
    });

    expect(result.success && result.data.productCategories).toEqual([
      "Groceries",
      "Fashion",
    ]);
  });

  it("requires at least one product category", () => {
    expect(
      updateSettingsSchema.safeParse({ productCategories: [] }).success,
    ).toBe(false);
  });
});

describe("admin request schemas", () => {
  it("normalises an invited role key to uppercase", () => {
    const result = adminInviteSchema.safeParse({
      name: "Ada Admin",
      email: "ada@routiq.ng",
      adminRole: "regional_support",
    });

    expect(result.success && result.data.adminRole).toBe("REGIONAL_SUPPORT");
  });

  it("rejects an invalid role key", () => {
    expect(
      adminInviteSchema.safeParse({
        name: "Ada Admin",
        email: "ada@routiq.ng",
        adminRole: "1 INVALID",
      }).success,
    ).toBe(false);
  });

  it("requires a full-length invitation token", () => {
    expect(
      acceptAdminInvitationSchema.safeParse({
        token: "short",
        password: "Str0ng!pass",
      }).success,
    ).toBe(false);
  });

  it("defaults permission grants and revocations to empty arrays", () => {
    const result = adminPermissionsSchema.safeParse({});

    expect(result.success && result.data).toEqual({
      grants: [],
      revocations: [],
      reason: undefined,
    });
  });

  it("paginates the admin directory with safe defaults", () => {
    const result = listAdminsQuerySchema.parse({});

    expect(result).toMatchObject({
      sortBy: "createdAt",
      sortOrder: "desc",
      page: 1,
      limit: 20,
    });
  });
});

describe("audit trail", () => {
  it("prefers the administrative role in the actor snapshot", () => {
    const actor = auditActorFromUser({
      _id: "507f1f77bcf86cd799439011",
      name: "Ada Admin",
      email: "ada@routiq.ng",
      role: "admin",
      adminRole: "FINANCE_ADMIN",
    });

    expect(actor).toEqual({
      id: "507f1f77bcf86cd799439011",
      name: "Ada Admin",
      email: "ada@routiq.ng",
      role: "FINANCE_ADMIN",
    });
  });

  it("labels a missing actor as the system", () => {
    expect(auditActorFromUser(null)).toMatchObject({
      id: null,
      name: "System",
      role: "system",
    });
  });

  it("captures the first forwarded address and request shape", () => {
    const meta = requestMetadata({
      headers: {
        "x-forwarded-for": "203.0.113.7, 10.0.0.1",
        "user-agent": "vitest",
      },
      method: "PATCH",
      originalUrl: "/api/v1/settings?scope=all",
    });

    expect(meta).toEqual({
      ipAddress: "203.0.113.7",
      userAgent: "vitest",
      method: "PATCH",
      path: "/api/v1/settings?scope=all",
    });
  });

  it("does not throw when no database connection is open", async () => {
    await expect(
      recordAudit({
        actor: { name: "System" },
        action: "settings.updated",
        entityType: "settings",
      }),
    ).resolves.toBeUndefined();
  });

  it("defaults the audit query to newest first page one", () => {
    const result = listAuditLogsQuerySchema.parse({});

    expect(result).toMatchObject({
      sortBy: "createdAt",
      sortOrder: "desc",
      page: 1,
      limit: 20,
    });
  });

  it("rejects an unknown entity filter", () => {
    expect(
      listAuditLogsQuerySchema.safeParse({ entityType: "everything" }).success,
    ).toBe(false);
  });

  it("rejects an invalid date range value", () => {
    expect(
      listAuditLogsQuerySchema.safeParse({ createdFrom: "not-a-date" }).success,
    ).toBe(false);
  });
});
