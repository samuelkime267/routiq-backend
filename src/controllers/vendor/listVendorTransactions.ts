import type { NextFunction, Request, Response } from "express";
import Payment from "@/models/payment.model";
import User from "@/models/user.model";
import { vendorTransactionsQuerySchema } from "@/schemas/vendor";
import { createError } from "@/utils";

export const listVendorTransactions = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { status, page, limit } = vendorTransactionsQuerySchema.parse(
      req.query,
    );

    const vendor = await User.exists({
      _id: req.params.vendorId,
      role: "vendor",
    });
    if (!vendor) throw createError("Vendor not found", 404);

    const query = Payment.find({ vendor: req.params.vendorId });
    if (status) query.where("status", status);

    const skip = (page - 1) * limit;
    const [transactions, total] = await Promise.all([
      query.sort({ createdAt: -1 }).skip(skip).limit(limit),
      Payment.countDocuments(query.getFilter()),
    ]);

    res.status(200).json({
      message: "Vendor transactions retrieved successfully",
      success: true,
      data: {
        transactions,
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
