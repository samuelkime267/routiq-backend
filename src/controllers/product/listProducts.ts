import type { NextFunction, Request, Response } from "express";
import Product from "@/models/product.model";
import { publicProductQuerySchema } from "@/schemas/marketplace";
import { listProductsQuerySchema } from "@/schemas/product";
import { queryPublicProducts } from "@/services/marketplace/products";
import {
  applyProductFilters,
  PRODUCT_POPULATE,
  productPublicationSummary,
  productSort,
  productStatusSummary,
} from "@/services/products/query";
import { assertPermission, isActiveAdmin } from "@/utils";

export const listProducts = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    // Administrators keep the moderation console contract. Everyone else,
    // including anonymous visitors, receives the public catalogue, which is
    // filtered server-side by `queryPublicProducts`.
    if (isActiveAdmin(req.user)) {
      assertPermission(req.user, ["products.view"] as const);
    } else {
      const query = publicProductQuerySchema.parse(req.query);
      const result = await queryPublicProducts(query);

      res.status(200).json({
        message: "Products retrieved successfully",
        success: true,
        data: result,
      });
      return;
    }

    const query = listProductsQuerySchema.parse(req.query);
    const { page, limit, sortBy, sortOrder, ...filters } = query;

    const filter = applyProductFilters({}, filters);
    const skip = (page - 1) * limit;

    const [products, total, summary, publicationSummary] = await Promise.all([
      Product.find(filter)
        .populate([...PRODUCT_POPULATE])
        .sort(productSort(sortBy, sortOrder))
        .skip(skip)
        .limit(limit),
      Product.countDocuments(filter),
      productStatusSummary(),
      productPublicationSummary(),
    ]);

    res.status(200).json({
      message: "Products retrieved successfully",
      success: true,
      data: {
        products,
        summary,
        publicationSummary,
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
