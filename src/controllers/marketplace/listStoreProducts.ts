import type { NextFunction, Request, Response } from "express";
import { publicProductQuerySchema } from "@/schemas/marketplace";
import { listPublicStoreProducts } from "@/services/marketplace/stores";

export const listStoreProducts = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const query = publicProductQuerySchema.parse(req.query);
    const result = await listPublicStoreProducts(
      String(req.params.storeId),
      query,
    );

    res.status(200).json({
      message: "Store products retrieved successfully",
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
