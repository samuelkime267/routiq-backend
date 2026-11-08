import type { NextFunction, Request, Response } from "express";
import type { RestoreProductSchemaType } from "@/schemas/product";
import { runAdminProductAction } from "@/services/products/adminAction";
import { createError } from "@/utils";

export const restoreProduct = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const admin = req.user;
    if (!admin) throw createError("User not authenticated", 401);

    const { note } = req.body as RestoreProductSchemaType;
    const { product } = await runAdminProductAction({
      productId: String(req.params.productId),
      admin,
      action: "restore",
      permission: "products.moderate",
      note: note ?? null,
    });

    res.status(200).json({
      message: "Product restored successfully",
      success: true,
      data: { product },
    });
  } catch (error) {
    next(error);
  }
};
