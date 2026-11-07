import type { NextFunction, Request, Response } from "express";
import Product from "@/models/product.model";
import User from "@/models/user.model";
import { vendorProductsQuerySchema } from "@/schemas/vendor";
import { createError } from "@/utils";

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const listVendorProducts = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { status, search, page, limit } = vendorProductsQuerySchema.parse(
      req.query,
    );

    const vendor = await User.exists({
      _id: req.params.vendorId,
      role: "vendor",
    });
    if (!vendor) throw createError("Vendor not found", 404);

    const query = Product.find({ vendor: req.params.vendorId });
    if (status) query.where("status", status);

    if (search) {
      const pattern = new RegExp(escapeRegExp(search), "i");
      query.or([{ name: pattern }, { sku: pattern }, { category: pattern }]);
    }

    const skip = (page - 1) * limit;
    const [products, total] = await Promise.all([
      query.sort({ createdAt: -1 }).skip(skip).limit(limit),
      Product.countDocuments(query.getFilter()),
    ]);

    res.status(200).json({
      message: "Vendor products retrieved successfully",
      success: true,
      data: {
        products,
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
