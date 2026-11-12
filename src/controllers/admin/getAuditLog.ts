import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import AuditLog from "@/models/auditLog.model";
import { createError } from "@/utils";

export const getAuditLog = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { logId } = req.params;

    if (typeof logId !== "string" || !mongoose.isValidObjectId(logId)) {
      throw createError("Audit log not found", 404);
    }

    const log = await AuditLog.findById(logId).lean();
    if (!log) throw createError("Audit log not found", 404);

    res.status(200).json({
      message: "Audit log retrieved successfully",
      success: true,
      data: { log },
    });
  } catch (error) {
    next(error);
  }
};
