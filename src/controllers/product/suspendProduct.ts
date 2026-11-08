import type { NextFunction, Request, Response } from "express";
import type { SuspendProductSchemaType } from "@/schemas/product";
import { runAdminProductAction } from "@/services/products/adminAction";
import { createError } from "@/utils";

export const suspendProduct = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const admin = req.user;
    if (!admin) throw createError("User not authenticated", 401);

    const { reason } = req.body as SuspendProductSchemaType;
    const { product } = await runAdminProductAction({
      productId: String(req.params.productId),
      admin,
      action: "suspend",
      permission: "products.moderate",
      reason,
    });

    res.status(200).json({
      message: "Product suspended successfully",
      success: true,
      data: { product },
    });
  } catch (error) {
    next(error);
  }
};
