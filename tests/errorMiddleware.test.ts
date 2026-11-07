import { beforeEach, describe, expect, it, vi } from "vitest";
import multer from "multer";
import type { NextFunction, Request, Response } from "express";
import { errorMiddleware } from "@/middleware/error.middleware";
import { MAX_UPLOAD_SIZE_BYTES } from "@/middleware/upload.middleware";

const createResponse = () => {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);

  return res as unknown as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
};

describe("errorMiddleware", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns 413 when an upload exceeds the size limit", () => {
    const res = createResponse();

    errorMiddleware(
      new multer.MulterError("LIMIT_FILE_SIZE"),
      {} as Request,
      res,
      vi.fn() as unknown as NextFunction,
    );

    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: `File is too large. Maximum size is ${MAX_UPLOAD_SIZE_BYTES / (1024 * 1024)}MB`,
    });
  });

  it("returns the status code of a custom error", () => {
    const res = createResponse();
    const error = Object.assign(new Error("Store not found"), {
      statusCode: 404,
    });

    errorMiddleware(
      error,
      {} as Request,
      res,
      vi.fn() as unknown as NextFunction,
    );

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Store not found",
    });
  });
});
