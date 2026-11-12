import type { NextFunction, Request, Response } from "express";
import { marketplaceSearchQuerySchema } from "@/schemas/marketplace";
import { searchPublicMarketplace } from "@/services/marketplace/search";

export const searchMarketplace = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const query = marketplaceSearchQuerySchema.parse(req.query);
    const result = await searchPublicMarketplace(query);

    res.status(200).json({
      message: "Search results retrieved successfully",
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
