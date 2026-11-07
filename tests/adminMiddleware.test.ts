import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import type { CustomError } from "@/types";
import { requireAdmin, requirePermission } from "@/middleware/admin.middleware";

const run = (
  middleware: (req: Request, res: Response, next: NextFunction) => void,
  user?: unknown,
) => {
  const req = { user } as unknown as Request;
  const next = vi.fn() as unknown as NextFunction;

  middleware(req, {} as Response, next);

  return next as unknown as ReturnType<typeof vi.fn>;
};

const admin = (overrides: Record<string, unknown> = {}) => ({
  _id: "admin-1",
  role: "admin",
  status: "active",
  adminRole: "SUPPORT_ADMIN",
  adminStatus: "ACTIVE",
  permissionGrants: [],
  permissionRevocations: [],
  ...overrides,
});

describe("requireAdmin", () => {
  it("rejects unauthenticated requests", () => {
    const next = run(requireAdmin);

    expect((next.mock.calls[0][0] as CustomError).statusCode).toBe(401);
  });

  it("rejects ordinary users", () => {
    const next = run(requireAdmin, admin({ role: "user", adminRole: null }));

    expect((next.mock.calls[0][0] as CustomError).statusCode).toBe(403);
  });

  it("rejects suspended admins", () => {
    const next = run(requireAdmin, admin({ adminStatus: "SUSPENDED" }));

    expect((next.mock.calls[0][0] as CustomError).statusCode).toBe(403);
  });

  it("allows an active admin", () => {
    const next = run(requireAdmin, admin());

    expect(next).toHaveBeenCalledWith();
  });
});

describe("requirePermission", () => {
  it("allows a permission granted to the role", () => {
    const next = run(requirePermission("disputes.view"), admin());

    expect(next).toHaveBeenCalledWith();
  });

  it("denies a missing permission", () => {
    const next = run(
      requirePermission("transactions.view"),
      admin({ adminRole: "SUPPORT_ADMIN" }),
    );

    expect((next.mock.calls[0][0] as CustomError).statusCode).toBe(403);
  });

  it("honours per-admin revocations", () => {
    const next = run(
      requirePermission("disputes.view"),
      admin({ permissionRevocations: ["disputes.view"] }),
    );

    expect((next.mock.calls[0][0] as CustomError).statusCode).toBe(403);
  });

  it("requires every listed permission", () => {
    const next = run(
      requirePermission("disputes.view", "transactions.view"),
      admin(),
    );

    expect((next.mock.calls[0][0] as CustomError).statusCode).toBe(403);
  });
});
