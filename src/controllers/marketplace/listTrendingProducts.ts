import type { NextFunction, Request, Response } from "express";
import { publicProductQuerySchema } from "@/schemas/marketplace";
import { rankedPublicProducts } from "@/services/marketplace/products";

export const listTrendingProducts = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const query = publicProductQuerySchema.parse(req.query);
    const result = await rankedPublicProducts({
      sinceDays: 14,
      query,
      label: "Trending products purchased in the last 14 days",
    });

    res.status(200).json({
      message: "Trending products retrieved successfully",
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
