import type { NextFunction, Request, Response } from "express";
import { publicCategoryProductsQuerySchema } from "@/schemas/marketplace";
import { listPublicCategoryProducts } from "@/services/marketplace/categories";

export const listCategoryProducts = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const query = publicCategoryProductsQuerySchema.parse(req.query);
    const result = await listPublicCategoryProducts(
      String(req.params.categoryId),
      query,
    );

    res.status(200).json({
      message: "Category products retrieved successfully",
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
