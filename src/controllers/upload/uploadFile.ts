import { NextFunction, Request, Response } from "express";
import { createError } from "@/utils";
import {
  cloudinaryFolder,
  isCloudinaryConfigured,
  uploadBufferToCloudinary,
} from "@/lib/cloudinary";
import { UploadFileSchemaType } from "@/schemas/upload";

export const uploadFile = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!isCloudinaryConfigured) {
      throw createError("File uploads are not configured", 503);
    }

    if (!req.file) {
      throw createError("No file uploaded", 400);
    }

    const { purpose, documentType } = req.body as UploadFileSchemaType;
    const isImage = req.file.mimetype.startsWith("image/");

    const result = await uploadBufferToCloudinary(req.file.buffer, {
      folder: cloudinaryFolder(purpose),
      resource_type: isImage ? "image" : "auto",
      use_filename: true,
      unique_filename: true,
      overwrite: false,
    });

    res.status(201).json({
      message: "File uploaded successfully",
      success: true,
      data: {
        url: result.secure_url,
        publicId: result.public_id,
        format: result.format,
        resourceType: result.resource_type,
        bytes: result.bytes,
        originalName: req.file.originalname,
        purpose,
        documentType: documentType ?? null,
      },
    });
  } catch (error) {
    next(error);
  }
};
