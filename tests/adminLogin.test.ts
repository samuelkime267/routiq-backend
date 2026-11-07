import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { Types } from "mongoose";
import type { CustomError } from "@/types";

vi.mock("@/models/user.model", () => ({
  default: {
    findOne: vi.fn(),
  },
}));

import User from "@/models/user.model";
import { adminLogin } from "@/controllers/admin/adminLogin";

const findUser = (user: unknown) => {
  vi.mocked(User.findOne).mockReturnValue({
    select: vi.fn().mockResolvedValue(user),
  } as never);
};

const makeUser = async (overrides: Record<string, unknown> = {}) => ({
  _id: new Types.ObjectId(),
  name: "Admin User",
  email: "admin@routiq.test",
  password: await bcrypt.hash("AdminPass1!", 4),
  authProvider: "local",
  role: "admin",
  adminRole: "SUPER_ADMIN",
  adminStatus: "ACTIVE",
  status: "active",
  isEmailVerified: true,
  permissionGrants: [],
  permissionRevocations: [],
  lastLoginAt: null as Date | null,
  save: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

const request = (body: Record<string, unknown>) =>
  ({ body, cookies: {} }) as unknown as Request;

const response = () => {
  const json = vi.fn();
  const status = vi.fn();
  const cookie = vi.fn();
  const res = { cookie, status, json } as unknown as Response;

  cookie.mockReturnValue(res);
  status.mockReturnValue(res);
  json.mockReturnValue(res);

  return { res, json, status, cookie };
};

const run = async (req: Request, res: Response) => {
  const next = vi.fn() as unknown as NextFunction;

  await adminLogin(req, res, next);

  return next as unknown as ReturnType<typeof vi.fn>;
};

describe("adminLogin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("signs in an active admin and records the login time", async () => {
    const user = await makeUser();
    findUser(user);
    const { res, json, status, cookie } = response();

    const next = await run(request({ email: user.email, password: "AdminPass1!" }), res);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(200);
    expect(cookie).toHaveBeenCalled();
    expect(user.save).toHaveBeenCalled();
    expect(user.lastLoginAt).toBeInstanceOf(Date);

    const payload = json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.data.token.accessToken).toEqual(expect.any(String));
    expect(payload.data.permissions).toContain("roles.manage");
  });

  it("rejects unknown emails without revealing whether the account exists", async () => {
    findUser(null);
    const { res } = response();

    const next = await run(
      request({ email: "missing@routiq.test", password: "AdminPass1!" }),
      res,
    );

    expect((next.mock.calls[0][0] as CustomError).statusCode).toBe(401);
  });

  it("rejects non-admin accounts with the same generic message", async () => {
    findUser(await makeUser({ role: "vendor", adminRole: null }));
    const { res } = response();

    const next = await run(
      request({ email: "vendor@routiq.test", password: "AdminPass1!" }),
      res,
    );

    const error = next.mock.calls[0][0] as CustomError;
    expect(error.statusCode).toBe(401);
    expect(error.message).toBe("Invalid email or password");
  });

  it("rejects a wrong password", async () => {
    findUser(await makeUser());
    const { res } = response();

    const next = await run(
      request({ email: "admin@routiq.test", password: "WrongPass1!" }),
      res,
    );

    expect((next.mock.calls[0][0] as CustomError).statusCode).toBe(401);
  });

  it("rejects suspended admins even with a valid password", async () => {
    findUser(await makeUser({ adminStatus: "SUSPENDED", status: "suspended" }));
    const { res } = response();

    const next = await run(
      request({ email: "admin@routiq.test", password: "AdminPass1!" }),
      res,
    );

    const error = next.mock.calls[0][0] as CustomError;
    expect(error.statusCode).toBe(403);
    expect(error.message).toContain("suspended");
  });

  it("tells invited admins to accept their invitation instead of signing in", async () => {
    findUser(
      await makeUser({
        password: undefined,
        adminStatus: "INVITED",
        status: "inactive",
      }),
    );
    const { res } = response();

    const next = await run(
      request({ email: "admin@routiq.test", password: "AdminPass1!" }),
      res,
    );

    const error = next.mock.calls[0][0] as CustomError;
    expect(error.statusCode).toBe(403);
    expect(error.message).toContain("invitation");
  });

  it("rejects deactivated admins", async () => {
    findUser(
      await makeUser({ adminStatus: "DEACTIVATED", status: "inactive" }),
    );
    const { res } = response();

    const next = await run(
      request({ email: "admin@routiq.test", password: "AdminPass1!" }),
      res,
    );

    const error = next.mock.calls[0][0] as CustomError;
    expect(error.statusCode).toBe(403);
    expect(error.message).toContain("deactivated");
  });
});
