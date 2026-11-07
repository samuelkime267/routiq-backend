import type { NextFunction, Request, Response } from "express";
import StoreReview from "@/models/storeReview.model";
import { listStoreHistoryQuerySchema } from "@/schemas/store";
import { createError } from "@/utils";
import Store from "@/models/store.model";

export const listStoreHistory = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { page, limit } = listStoreHistoryQuerySchema.parse(req.query);

    const store = await Store.exists({ _id: req.params.storeId });
    if (!store) throw createError("Store not found", 404);

    const skip = (page - 1) * limit;
    const [history, total] = await Promise.all([
      StoreReview.find({ store: req.params.storeId })
        .populate("actor", "name email adminRole")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      StoreReview.countDocuments({ store: req.params.storeId }),
    ]);

    res.status(200).json({
      message: "Store history retrieved successfully",
      success: true,
      data: {
        history,
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
