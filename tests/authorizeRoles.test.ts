import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { authorizeRoles } from "@/middleware/authorizeRoles.middleware";
import type { CustomError } from "@/types";

const run = (middleware: ReturnType<typeof authorizeRoles>, user?: unknown) => {
  const req = { user } as unknown as Request;
  const next = vi.fn() as unknown as NextFunction;

  middleware(req, {} as Response, next);

  return next as unknown as ReturnType<typeof vi.fn>;
};

describe("authorizeRoles", () => {
  it("rejects unauthenticated requests with 401", () => {
    const next = run(authorizeRoles("vendor", "admin"));

    const error = next.mock.calls[0][0] as CustomError;
    expect(error.statusCode).toBe(401);
  });

  it("rejects a user without an allowed role with 403", () => {
    const next = run(authorizeRoles("vendor", "admin"), { role: "user" });

    const error = next.mock.calls[0][0] as CustomError;
    expect(error.statusCode).toBe(403);
  });

  it("treats a missing role as a regular user", () => {
    const next = run(authorizeRoles("vendor", "admin"), {});

    const error = next.mock.calls[0][0] as CustomError;
    expect(error.statusCode).toBe(403);
  });

  it("allows a matching role", () => {
    const next = run(authorizeRoles("vendor", "admin"), { role: "vendor" });

    expect(next).toHaveBeenCalledWith();
  });

  it("allows active admins", () => {
    const next = run(authorizeRoles("admin"), {
      role: "admin",
      adminRole: "SUPPORT_ADMIN",
      adminStatus: "ACTIVE",
    });

    expect(next).toHaveBeenCalledWith();
  });

  it("rejects admins whose admin lifecycle is not active", () => {
    for (const adminStatus of ["INVITED", "SUSPENDED", "DEACTIVATED"]) {
      const next = run(authorizeRoles("admin"), {
        role: "admin",
        adminRole: "SUPPORT_ADMIN",
        adminStatus,
      });

      expect((next.mock.calls[0][0] as CustomError).statusCode).toBe(403);
    }
  });

  it("rejects admin records without an admin role", () => {
    const next = run(authorizeRoles("admin"), {
      role: "admin",
      adminRole: null,
      adminStatus: null,
    });

    expect((next.mock.calls[0][0] as CustomError).statusCode).toBe(403);
  });
});
