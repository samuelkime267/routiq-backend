import type { NextFunction, Request, Response } from "express";
import { publicProductQuerySchema } from "@/schemas/marketplace";
import { queryPublicProducts } from "@/services/marketplace/products";

export const listNewArrivals = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const query = publicProductQuerySchema.parse(req.query);
    const result = await queryPublicProducts({
      ...query,
      sortBy: "createdAt",
      sortOrder: "desc",
    });

    res.status(200).json({
      message: "New arrivals retrieved successfully",
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
