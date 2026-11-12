import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import type { CustomError } from "@/types";
import { optionalAuth } from "@/middleware/optionalAuth.middleware";

async function run(authorization?: string) {
  const req = {
    headers: authorization ? { authorization } : {},
  } as Request;
  const next = vi.fn() as unknown as NextFunction;

  await optionalAuth(req, {} as Response, next);

  return {
    req,
    next,
    error: (next as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0]?.[0] as CustomError | undefined,
  };
}

describe("optionalAuth", () => {
  it("lets anonymous requests through without a user", async () => {
    const { req, next, error } = await run();

    expect(next).toHaveBeenCalledTimes(1);
    expect(error).toBeUndefined();
    expect(req.user).toBeUndefined();
  });

  it("rejects a malformed authorization header", async () => {
    const { error } = await run("Basic abc");

    expect(error?.statusCode).toBe(401);
  });

  it("rejects a bearer header without a token", async () => {
    const { error } = await run("Bearer");

    expect(error?.statusCode).toBe(401);
  });

  it("rejects an invalid access token instead of downgrading to anonymous", async () => {
    const { error } = await run("Bearer not-a-real-token");

    expect(error?.statusCode).toBe(401);
  });
});
