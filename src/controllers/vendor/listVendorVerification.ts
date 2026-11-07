import type { NextFunction, Request, Response } from "express";
import Store from "@/models/store.model";
import StoreReview from "@/models/storeReview.model";
import User from "@/models/user.model";
import { vendorHistoryQuerySchema } from "@/schemas/vendor";
import { createError } from "@/utils";

export const listVendorVerification = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { action, page, limit } = vendorHistoryQuerySchema.parse(req.query);

    const vendor = await User.exists({
      _id: req.params.vendorId,
      role: "vendor",
    });
    if (!vendor) throw createError("Vendor not found", 404);

    const stores = await Store.find({ owner: req.params.vendorId }).select(
      "name status submittedAt reviewedAt",
    );
    const storeIds = stores.map((store) => store._id);

    if (storeIds.length === 0) {
      res.status(200).json({
        message: "Vendor verification history retrieved successfully",
        success: true,
        data: {
          history: [],
          stores: [],
          pagination: { page, limit, total: 0, pages: 0 },
        },
      });
      return;
    }

    const filter: Record<string, unknown> = { store: { $in: storeIds } };
    if (action) filter.action = action;

    const skip = (page - 1) * limit;
    const [history, total] = await Promise.all([
      StoreReview.find(filter)
        .populate("actor", "name email adminRole")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      StoreReview.countDocuments(filter),
    ]);

    res.status(200).json({
      message: "Vendor verification history retrieved successfully",
      success: true,
      data: {
        history,
        stores,
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
