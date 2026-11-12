import type { NextFunction, Request, Response } from "express";
import { publicStoreQuerySchema } from "@/schemas/marketplace";
import { featuredPublicStores } from "@/services/marketplace/stores";

export const listFeaturedStores = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { page, limit } = publicStoreQuerySchema.parse(req.query);
    const result = await featuredPublicStores({ page, limit });

    res.status(200).json({
      message: "Featured stores retrieved successfully",
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
