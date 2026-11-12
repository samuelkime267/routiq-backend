import type { NextFunction, Request, Response } from "express";
import { publicProductQuerySchema } from "@/schemas/marketplace";
import { rankedPublicProducts } from "@/services/marketplace/products";

export const listPopularProducts = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const query = publicProductQuerySchema.parse(req.query);
    const result = await rankedPublicProducts({
      sinceDays: 90,
      query,
      label: "Most purchased products in the last 90 days",
    });

    res.status(200).json({
      message: "Popular products retrieved successfully",
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
