import type { NextFunction, Request, Response } from "express";
import { getPublicCategory } from "@/services/marketplace/categories";

export const getCategory = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await getPublicCategory(String(req.params.categoryId));

    res.status(200).json({
      message: "Category retrieved successfully",
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
