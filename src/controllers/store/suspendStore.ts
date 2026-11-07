import type { NextFunction, Request, Response } from "express";
import type { SuspendStoreSchemaType } from "@/schemas/store";
import { runAdminStoreAction } from "@/services/store/adminAction";
import { createError } from "@/utils";

export const suspendStore = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const admin = req.user;
    if (!admin) throw createError("User not authenticated", 401);

    const { reason } = req.body as SuspendStoreSchemaType;
    const { store } = await runAdminStoreAction({
      storeId: String(req.params.storeId),
      admin,
      action: "suspend",
      permission: "stores.suspend",
      reason,
    });

    res.status(200).json({
      message: "Store suspended successfully",
      success: true,
      data: { store },
    });
  } catch (error) {
    next(error);
  }
};
