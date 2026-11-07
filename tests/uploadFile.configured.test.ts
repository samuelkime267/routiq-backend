import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";

const { cloudinaryMock } = vi.hoisted(() => ({
  cloudinaryMock: {
    isCloudinaryConfigured: true,
    uploadBufferToCloudinary: vi.fn(),
    cloudinaryFolder: vi.fn((purpose: string) => `routiq/${purpose}`),
  },
}));

vi.mock("@/lib/cloudinary", () => cloudinaryMock);

import { uploadFile } from "@/controllers/upload/uploadFile";

const createResponse = () => {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);

  return res as unknown as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
};

describe("uploadFile controller (configured)", () => {
  beforeEach(() => {
    cloudinaryMock.uploadBufferToCloudinary.mockReset();
  });

  it("rejects a request without a file", async () => {
    const res = createResponse();
    const next = vi.fn();

    await uploadFile(
      { body: { purpose: "store_logo" } } as unknown as Request,
      res,
      next as unknown as NextFunction,
    );

    expect(next.mock.calls[0][0].statusCode).toBe(400);
    expect(cloudinaryMock.uploadBufferToCloudinary).not.toHaveBeenCalled();
  });

  it("uploads an image to the purpose folder", async () => {
    const res = createResponse();
    const next = vi.fn();
    cloudinaryMock.uploadBufferToCloudinary.mockResolvedValue({
      secure_url: "https://res.cloudinary.com/demo/logo.png",
      public_id: "routiq/store_logo/logo",
      format: "png",
      resource_type: "image",
      bytes: 1234,
    });

    const file = {
      buffer: Buffer.from("image"),
      mimetype: "image/png",
      originalname: "logo.png",
    };

    await uploadFile(
      {
        body: { purpose: "store_logo" },
        file,
      } as unknown as Request,
      res,
      next as unknown as NextFunction,
    );

    expect(cloudinaryMock.cloudinaryFolder).toHaveBeenCalledWith("store_logo");
    expect(cloudinaryMock.uploadBufferToCloudinary).toHaveBeenCalledWith(
      file.buffer,
      expect.objectContaining({
        folder: "routiq/store_logo",
        resource_type: "image",
      }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      message: "File uploaded successfully",
      success: true,
      data: {
        url: "https://res.cloudinary.com/demo/logo.png",
        publicId: "routiq/store_logo/logo",
        format: "png",
        resourceType: "image",
        bytes: 1234,
        originalName: "logo.png",
        purpose: "store_logo",
        documentType: null,
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("uses auto resource type for PDF documents", async () => {
    const res = createResponse();
    const next = vi.fn();
    cloudinaryMock.uploadBufferToCloudinary.mockResolvedValue({
      secure_url: "https://res.cloudinary.com/demo/doc.pdf",
      public_id: "routiq/store_document/doc",
      format: "pdf",
      resource_type: "raw",
      bytes: 4321,
    });

    await uploadFile(
      {
        body: { purpose: "store_document", documentType: "cac_certificate" },
        file: {
          buffer: Buffer.from("pdf"),
          mimetype: "application/pdf",
          originalname: "cac.pdf",
        },
      } as unknown as Request,
      res,
      next as unknown as NextFunction,
    );

    expect(cloudinaryMock.uploadBufferToCloudinary).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({ resource_type: "auto" }),
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ documentType: "cac_certificate" }),
      }),
    );
  });

  it("forwards Cloudinary failures to the error handler", async () => {
    const res = createResponse();
    const next = vi.fn();
    cloudinaryMock.uploadBufferToCloudinary.mockRejectedValue(
      new Error("Cloudinary is down"),
    );

    await uploadFile(
      {
        body: { purpose: "profile_picture" },
        file: {
          buffer: Buffer.from("image"),
          mimetype: "image/jpeg",
          originalname: "me.jpg",
        },
      } as unknown as Request,
      res,
      next as unknown as NextFunction,
    );

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.status).not.toHaveBeenCalled();
  });
});
