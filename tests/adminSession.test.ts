import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "@/config/env";
import type { CustomError } from "@/types";

vi.mock("@/models/user.model", () => ({
  default: {
    findById: vi.fn(),
  },
}));

import User from "@/models/user.model";
import { isAuthenticated } from "@/middleware/isAuthenticated.middleware";
import { isValidRefreshToken } from "@/middleware/isValidRefreshToken.middleware";

const expiredToken = (type: "access" | "refresh") =>
  jwt.sign({ id: "507f1f77bcf86cd799439011", type }, JWT_SECRET, {
    expiresIn: -1,
  });

const accessToken = () =>
  jwt.sign(
    { id: "507f1f77bcf86cd799439011", type: "access" },
    JWT_SECRET,
    { expiresIn: "5m" },
  );

const run = async (
  middleware: (req: Request, res: Response, next: NextFunction) => unknown,
  req: Request,
) => {
  const next = vi.fn() as unknown as NextFunction;

  await middleware(req, {} as Response, next);

  return next as unknown as ReturnType<typeof vi.fn>;
};

const makeRequest = (overrides: Record<string, unknown> = {}) =>
  ({ headers: {}, cookies: {}, ...overrides }) as unknown as Request;

describe("session expiry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an expired access token", async () => {
    const req = makeRequest({
      headers: { authorization: `Bearer ${expiredToken("access")}` },
    });

    const next = await run(isAuthenticated, req);

    expect((next.mock.calls[0][0] as CustomError).statusCode).toBe(401);
  });

  it("rejects an expired refresh token", async () => {
    const req = makeRequest({
      cookies: { refreshToken: expiredToken("refresh") },
    });

    const next = await run(isValidRefreshToken, req);

    expect((next.mock.calls[0][0] as CustomError).statusCode).toBe(401);
  });

  it("rejects a malformed access token as unauthenticated, not a server error", async () => {
    const req = makeRequest({
      headers: { authorization: "Bearer not-a-real-token" },
    });

    const next = await run(isAuthenticated, req);

    expect((next.mock.calls[0][0] as CustomError).statusCode).toBe(401);
  });

  it("rejects a suspended admin's access token", async () => {
    vi.mocked(User.findById).mockResolvedValue({
      _id: "507f1f77bcf86cd799439011",
      role: "admin",
      adminRole: "SUPER_ADMIN",
      adminStatus: "SUSPENDED",
      status: "suspended",
    } as never);
    const req = makeRequest({
      headers: { authorization: `Bearer ${accessToken()}` },
    });

    const next = await run(isAuthenticated, req);

    expect((next.mock.calls[0][0] as CustomError).statusCode).toBe(403);
  });

  it("allows an active admin session", async () => {
    vi.mocked(User.findById).mockResolvedValue({
      _id: "507f1f77bcf86cd799439011",
      role: "admin",
      adminRole: "SUPER_ADMIN",
      adminStatus: "ACTIVE",
      status: "active",
    } as never);
    const req = makeRequest({
      headers: { authorization: `Bearer ${accessToken()}` },
    });

    const next = await run(isAuthenticated, req);

    expect(next).toHaveBeenCalledWith();
  });
});
