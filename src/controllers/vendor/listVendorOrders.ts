import type { NextFunction, Request, Response } from "express";
import Order from "@/models/order.model";
import User from "@/models/user.model";
import { vendorOrdersQuerySchema } from "@/schemas/vendor";
import { createError } from "@/utils";

export const listVendorOrders = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { status, page, limit } = vendorOrdersQuerySchema.parse(req.query);

    const vendor = await User.exists({
      _id: req.params.vendorId,
      role: "vendor",
    });
    if (!vendor) throw createError("Vendor not found", 404);

    const query = Order.find({ vendor: req.params.vendorId });
    if (status) query.where("status", status);

    const skip = (page - 1) * limit;
    const [orders, total] = await Promise.all([
      query.sort({ placedAt: -1, createdAt: -1 }).skip(skip).limit(limit),
      Order.countDocuments(query.getFilter()),
    ]);

    res.status(200).json({
      message: "Vendor orders retrieved successfully",
      success: true,
      data: {
        orders,
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
