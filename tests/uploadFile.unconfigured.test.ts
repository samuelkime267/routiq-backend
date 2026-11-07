import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";

vi.mock("@/lib/cloudinary", () => ({
  isCloudinaryConfigured: false,
  uploadBufferToCloudinary: vi.fn(),
  cloudinaryFolder: vi.fn((purpose: string) => `routiq/${purpose}`),
}));

import { uploadFile } from "@/controllers/upload/uploadFile";

describe("uploadFile controller (not configured)", () => {
  it("returns 503 until Cloudinary keys are set", async () => {
    const res = { status: vi.fn(), json: vi.fn() };
    const next = vi.fn();

    await uploadFile(
      {
        body: { purpose: "store_logo" },
        file: { buffer: Buffer.from("image"), mimetype: "image/png" },
      } as unknown as Request,
      res as unknown as Response,
      next as unknown as NextFunction,
    );

    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(503);
    expect(error.message).toBe("File uploads are not configured");
    expect(res.status).not.toHaveBeenCalled();
  });
});
