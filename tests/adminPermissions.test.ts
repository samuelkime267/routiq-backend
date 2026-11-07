import { describe, expect, it } from "vitest";
import {
  ADMIN_ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  SUPER_ADMIN_ONLY_PERMISSIONS,
  hasEveryPermission,
  hasPermission,
  permissionsForAdmin,
  permissionsForRole,
} from "@/config/permissions";

describe("admin permission registry", () => {
  it("defines every role with an explicit permission list", () => {
    for (const role of ADMIN_ROLES) {
      expect(Array.isArray(ROLE_PERMISSIONS[role])).toBe(true);
      expect(ROLE_PERMISSIONS[role].length).toBeGreaterThan(0);
    }
  });

  it("gives SUPER_ADMIN the full registry", () => {
    expect(new Set(permissionsForRole("SUPER_ADMIN"))).toEqual(
      new Set(PERMISSIONS),
    );
  });

  it("keeps sensitive permissions exclusive to SUPER_ADMIN by default", () => {
    for (const role of ADMIN_ROLES.filter((role) => role !== "SUPER_ADMIN")) {
      for (const permission of SUPER_ADMIN_ONLY_PERMISSIONS) {
        expect(ROLE_PERMISSIONS[role]).not.toContain(permission);
      }
    }
  });

  it("maps operational, finance, support and catalog roles to their domain", () => {
    expect(permissionsForRole("OPERATIONS_ADMIN")).toEqual(
      expect.arrayContaining([
        "vendors.manage",
        "stores.approve",
        "orders.manage",
        "shipments.manage",
      ]),
    );
    expect(permissionsForRole("FINANCE_ADMIN")).toEqual(
      expect.arrayContaining(["transactions.view", "escrow.view"]),
    );
    expect(permissionsForRole("SUPPORT_ADMIN")).toEqual(
      expect.arrayContaining(["disputes.view", "disputes.manage"]),
    );
    expect(permissionsForRole("CATALOG_ADMIN")).toEqual(
      expect.arrayContaining(["products.view", "products.moderate"]),
    );
  });

  it("applies per-admin grants on top of the role", () => {
    const permissions = permissionsForAdmin({
      adminRole: "SUPPORT_ADMIN",
      permissionGrants: ["transactions.view"],
    });

    expect(permissions).toContain("transactions.view");
    expect(permissions).toContain("disputes.manage");
  });

  it("lets revocations remove a role default", () => {
    expect(
      hasPermission(
        {
          adminRole: "OPERATIONS_ADMIN",
          permissionRevocations: ["stores.reject"],
        },
        "stores.reject",
      ),
    ).toBe(false);
  });

  it("returns no permissions without an admin role", () => {
    expect(permissionsForAdmin({})).toEqual([]);
    expect(hasPermission({}, "dashboard.view")).toBe(false);
  });

  it("requires every permission for hasEveryPermission", () => {
    const subject = { adminRole: "CATALOG_ADMIN" as const };

    expect(hasEveryPermission(subject, ["products.view"])).toBe(true);
    expect(
      hasEveryPermission(subject, ["products.view", "transactions.view"]),
    ).toBe(false);
  });
});
