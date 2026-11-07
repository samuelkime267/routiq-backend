import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import type { CustomError } from "@/types";

const { storeModel } = vi.hoisted(() => ({
  storeModel: {
    findOne: vi.fn(),
    exists: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock("@/models/store.model", () => ({ default: storeModel }));

import { createStore } from "@/controllers/store/createStore";

const createResponse = () => {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);

  return res as unknown as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
};

const request = (body: unknown, user?: unknown) =>
  ({ body, user }) as unknown as Request;

describe("createStore controller", () => {
  beforeEach(() => {
    storeModel.findOne.mockReset();
    storeModel.exists.mockReset();
    storeModel.create.mockReset();
    storeModel.exists.mockResolvedValue(null);
  });

  it("rejects an unauthenticated request", async () => {
    const res = createResponse();
    const next = vi.fn();

    await createStore(
      request({ name: "Routiq Mart" }),
      res,
      next as unknown as NextFunction,
    );

    const error = next.mock.calls[0][0] as CustomError;
    expect(error.statusCode).toBe(401);
    expect(storeModel.create).not.toHaveBeenCalled();
  });

  it("creates a pending store owned by the authenticated user", async () => {
    const res = createResponse();
    const next = vi.fn();
    const created = { _id: "store-1", name: "Routiq Mart", status: "pending" };
    storeModel.create.mockResolvedValue(created);

    await createStore(
      request({ name: "Routiq Mart" }, { _id: "user-1", role: "vendor" }),
      res,
      next as unknown as NextFunction,
    );

    expect(storeModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Routiq Mart",
        owner: "user-1",
        status: "pending",
        submittedAt: expect.any(Date),
      }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      message: "Store onboarding submitted successfully",
      success: true,
      data: { store: created },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a taken slug", async () => {
    const res = createResponse();
    const next = vi.fn();
    storeModel.findOne.mockResolvedValue({ _id: "existing-store" });

    await createStore(
      request(
        { name: "Routiq Mart", slug: "routiq-mart" },
        { _id: "user-1", role: "vendor" },
      ),
      res,
      next as unknown as NextFunction,
    );

    const error = next.mock.calls[0][0] as CustomError;
    expect(error.statusCode).toBe(400);
    expect(error.message).toBe("Store slug is already taken");
    expect(storeModel.create).not.toHaveBeenCalled();
  });

  it("generates a slug when none is provided", async () => {
    const res = createResponse();
    const next = vi.fn();
    storeModel.create.mockResolvedValue({ _id: "store-1" });

    await createStore(
      request({ name: "Routiq Mart" }, { _id: "user-1", role: "vendor" }),
      res,
      next as unknown as NextFunction,
    );

    expect(storeModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: expect.stringMatching(/^routiq-mart-[a-f0-9]{6}$/),
      }),
    );
  });
});
