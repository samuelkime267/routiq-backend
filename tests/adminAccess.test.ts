import { describe, expect, it } from "vitest";
import type { AdminRole, AdminStatus, Permission } from "@/config/permissions";
import type { CustomError } from "@/types";
import {
  assertActiveAdmin,
  assertAdminLoginAllowed,
  assertCanAssignAdminRole,
  assertCanChangeAdminStatus,
  assertCanInviteAdmin,
  assertCanManageAdmin,
  assertCanModifyPermissions,
  assertPermission,
  syncAdminStatusFields,
} from "@/utils/adminAccess";

interface AdminOverrides {
  _id?: string;
  role?: string;
  status?: string;
  adminRole?: AdminRole | null;
  adminStatus?: AdminStatus | null;
  permissionGrants?: Permission[];
  permissionRevocations?: Permission[];
}

const admin = (overrides: AdminOverrides = {}) => ({
  _id: "507f1f77bcf86cd799439011",
  role: "admin",
  status: "active",
  adminRole: "SUPER_ADMIN" as AdminRole | null,
  adminStatus: "ACTIVE" as AdminStatus | null,
  permissionGrants: [],
  permissionRevocations: [],
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

describe("assertActiveAdmin", () => {
  it("rejects unauthenticated requests", () => {
    expect(errorOf(() => assertActiveAdmin(undefined)).statusCode).toBe(401);
  });

  it("rejects non-admin accounts", () => {
    expect(
      errorOf(() => assertActiveAdmin(admin({ role: "vendor" }))).statusCode,
    ).toBe(403);
  });

  it("rejects admin accounts without an admin role", () => {
    expect(
      errorOf(() => assertActiveAdmin(admin({ adminRole: null }))).statusCode,
    ).toBe(403);
  });

  it("rejects invited, suspended and deactivated admins", () => {
    expect(
      errorOf(() => assertActiveAdmin(admin({ adminStatus: "INVITED" })))
        .message,
    ).toContain("invitation");
    expect(
      errorOf(() => assertActiveAdmin(admin({ adminStatus: "SUSPENDED" })))
        .message,
    ).toContain("suspended");
    expect(
      errorOf(() => assertActiveAdmin(admin({ adminStatus: "DEACTIVATED" })))
        .message,
    ).toContain("deactivated");
  });

  it("rejects an admin whose legacy status is inactive", () => {
    expect(
      errorOf(() => assertActiveAdmin(admin({ status: "inactive" })))
        .statusCode,
    ).toBe(403);
  });

  it("allows an active admin", () => {
    expect(() => assertActiveAdmin(admin())).not.toThrow();
  });
});

describe("assertAdminLoginAllowed", () => {
  it("allows only active admins", () => {
    expect(() => assertAdminLoginAllowed(admin())).not.toThrow();
    expect(
      errorOf(() => assertAdminLoginAllowed(admin({ adminStatus: "INVITED" })))
        .statusCode,
    ).toBe(403);
    expect(
      errorOf(() =>
        assertAdminLoginAllowed(admin({ adminStatus: "SUSPENDED" })),
      ).statusCode,
    ).toBe(403);
  });

  it("does not reveal whether an email belongs to an admin", () => {
    expect(
      errorOf(() => assertAdminLoginAllowed(admin({ role: "user" }))).message,
    ).toBe("Invalid email or password");
  });
});

describe("assertPermission", () => {
  it("allows a role permission", () => {
    expect(() =>
      assertPermission(admin({ adminRole: "FINANCE_ADMIN" }), [
        "transactions.view",
      ]),
    ).not.toThrow();
  });

  it("denies a permission the role does not hold", () => {
    expect(
      errorOf(() =>
        assertPermission(admin({ adminRole: "FINANCE_ADMIN" }), [
          "admins.manage",
        ]),
      ).statusCode,
    ).toBe(403);
  });

  it("denies every permission if the admin is suspended", () => {
    expect(
      errorOf(() =>
        assertPermission(admin({ adminStatus: "SUSPENDED" }), [
          "dashboard.view",
        ]),
      ).statusCode,
    ).toBe(403);
  });
});

describe("privilege escalation guards", () => {
  it("only lets a Super Admin assign SUPER_ADMIN", () => {
    const elevatedFinanceAdmin = admin({
      adminRole: "FINANCE_ADMIN",
      permissionGrants: ["roles.manage"],
    });

    expect(
      errorOf(() =>
        assertCanAssignAdminRole(elevatedFinanceAdmin, "SUPER_ADMIN"),
      ).statusCode,
    ).toBe(403);
    expect(() =>
      assertCanAssignAdminRole(admin(), "SUPER_ADMIN"),
    ).not.toThrow();
  });

  it("only lets a Super Admin invite another Super Admin", () => {
    const elevatedSupportAdmin = admin({
      adminRole: "SUPPORT_ADMIN",
      permissionGrants: ["admins.invite"],
    });

    expect(
      errorOf(() =>
        assertCanInviteAdmin(elevatedSupportAdmin, "SUPER_ADMIN"),
      ).statusCode,
    ).toBe(403);
    expect(() =>
      assertCanInviteAdmin(admin(), "SUPER_ADMIN"),
    ).not.toThrow();
  });

  it("prevents self-management and non-super access to Super Admins", () => {
    expect(
      errorOf(() => assertCanManageAdmin(admin(), admin())).statusCode,
    ).toBe(400);

    const elevatedFinanceAdmin = admin({
      _id: "507f1f77bcf86cd799439012",
      adminRole: "FINANCE_ADMIN",
      permissionGrants: ["admins.manage"],
    });

    expect(
      errorOf(() => assertCanManageAdmin(elevatedFinanceAdmin, admin()))
        .statusCode,
    ).toBe(403);
  });

  it("prevents removing the last active Super Admin", () => {
    const otherSuperAdmin = admin({ _id: "507f1f77bcf86cd799439099" });

    expect(
      errorOf(() =>
        assertCanChangeAdminStatus(admin(), otherSuperAdmin, "SUSPENDED", 1),
      ).statusCode,
    ).toBe(400);

    expect(() =>
      assertCanChangeAdminStatus(admin(), otherSuperAdmin, "SUSPENDED", 2),
    ).not.toThrow();
  });

  it("only lets a Super Admin change permissions, and never their own", () => {
    expect(
      errorOf(() =>
        assertCanModifyPermissions(
          admin({ adminRole: "OPERATIONS_ADMIN", permissionGrants: ["roles.manage"] }),
          admin({ _id: "other" }),
        ),
      ).statusCode,
    ).toBe(403);

    expect(
      errorOf(() => assertCanModifyPermissions(admin(), admin())).statusCode,
    ).toBe(400);

    expect(() =>
      assertCanModifyPermissions(admin(), admin({ _id: "other" })),
    ).not.toThrow();
  });
});

describe("syncAdminStatusFields", () => {
  it("keeps the shared status field aligned with the admin lifecycle", () => {
    expect(syncAdminStatusFields("ACTIVE")).toEqual({
      adminStatus: "ACTIVE",
      status: "active",
    });
    expect(syncAdminStatusFields("INVITED").status).toBe("inactive");
    expect(syncAdminStatusFields("SUSPENDED").status).toBe("suspended");
    expect(syncAdminStatusFields("DEACTIVATED").status).toBe("inactive");
  });
});
