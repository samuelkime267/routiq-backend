import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import multer from "multer";
import { zodErrorFormatter } from "@/utils";
import { CustomError } from "@/types";
import { MAX_UPLOAD_SIZE_BYTES } from "./upload.middleware";

export const errorMiddleware = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    let error: CustomError = { ...err, message: err.message };

    console.error(err);

    // Handle Zod validation errors
    if (err instanceof ZodError) {
      return res.status(422).json({
        success: false,
        error: "ValidationErrors",
        errors: zodErrorFormatter(err),
        message: "Validation failed",
      });
    }

    // Multer upload errors
    if (err instanceof multer.MulterError) {
      const message =
        err.code === "LIMIT_FILE_SIZE"
          ? `File is too large. Maximum size is ${MAX_UPLOAD_SIZE_BYTES / (1024 * 1024)}MB`
          : err.message;

      error = new Error(message) as CustomError;
      error.statusCode = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    }

    // Mongoose bad ObjectId
    if (err.name === "CastError") {
      error = new Error("Resource not found") as CustomError;
      error.statusCode = 404;
    }

    // Mongoose duplicate key
    if (err.code === 11000) {
      error = new Error("Duplicate field value entered") as CustomError;
      error.statusCode = 400;
    }

    // Mongoose validation error
    if (err.name === "ValidationError") {
      const errors = Object.values(err.errors).map((val: any) => ({
        field: val.path,
        message: val.message,
      }));

      error = new Error("Validation failed") as CustomError;
      error.statusCode = 422;
      error.errors = errors;
    }

    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Something went wrong",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
};
