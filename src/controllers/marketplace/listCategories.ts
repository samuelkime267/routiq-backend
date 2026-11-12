import type { NextFunction, Request, Response } from "express";
import { publicCategoryQuerySchema } from "@/schemas/marketplace";
import { listPublicCategories } from "@/services/marketplace/categories";

export const listCategories = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const query = publicCategoryQuerySchema.parse(req.query);
    const result = await listPublicCategories(query);

    res.status(200).json({
      message: "Categories retrieved successfully",
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
