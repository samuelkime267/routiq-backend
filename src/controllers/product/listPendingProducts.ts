import type { NextFunction, Request, Response } from "express";
import Product from "@/models/product.model";
import { pendingProductsQuerySchema } from "@/schemas/product";
import {
  applyProductFilters,
  PRODUCT_POPULATE,
  productSort,
  productStatusSummary,
} from "@/services/products/query";

/**
 * The moderation queue. It is the directory endpoint with `status=pending`
 * enforced on the server so the queue cannot be widened by a query parameter.
 */
export const listPendingProducts = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const query = pendingProductsQuerySchema.parse(req.query);
    const { page, limit, sortBy, sortOrder, ...filters } = query;

    const filter = applyProductFilters(
      {},
      { ...filters, status: "pending" },
    );
    const skip = (page - 1) * limit;

    const [products, total, summary] = await Promise.all([
      Product.find(filter)
        .populate([...PRODUCT_POPULATE])
        .sort(productSort(sortBy, sortOrder))
        .skip(skip)
        .limit(limit),
      Product.countDocuments(filter),
      productStatusSummary(),
    ]);

    res.status(200).json({
      message: "Pending products retrieved successfully",
      success: true,
      data: {
        products,
        summary,
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
