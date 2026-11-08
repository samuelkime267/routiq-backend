import type { NextFunction, Request, Response } from "express";
import type { ApproveProductSchemaType } from "@/schemas/product";
import { runAdminProductAction } from "@/services/products/adminAction";
import { createError } from "@/utils";

export const approveProduct = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const admin = req.user;
    if (!admin) throw createError("User not authenticated", 401);

    const { note } = req.body as ApproveProductSchemaType;
    const { product } = await runAdminProductAction({
      productId: String(req.params.productId),
      admin,
      action: "approve",
      permission: "products.moderate",
      note: note ?? null,
    });

    res.status(200).json({
      message: "Product approved successfully",
      success: true,
      data: { product },
    });
  } catch (error) {
    next(error);
  }
};
