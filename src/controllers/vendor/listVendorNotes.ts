import type { NextFunction, Request, Response } from "express";
import AdminNote from "@/models/adminNote.model";
import User from "@/models/user.model";
import { listStoreHistoryQuerySchema } from "@/schemas/store";
import { createError } from "@/utils";

export const listVendorNotes = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { page, limit } = listStoreHistoryQuerySchema.parse(req.query);

    const vendor = await User.exists({
      _id: req.params.vendorId,
      role: "vendor",
    });
    if (!vendor) throw createError("Vendor not found", 404);

    const skip = (page - 1) * limit;
    const [notes, total] = await Promise.all([
      AdminNote.find({ vendor: req.params.vendorId })
        .populate("author", "name email adminRole")
        .populate("store", "name status")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      AdminNote.countDocuments({ vendor: req.params.vendorId }),
    ]);

    res.status(200).json({
      message: "Vendor notes retrieved successfully",
      success: true,
      data: {
        notes,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};
