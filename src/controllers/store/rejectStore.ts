import type { NextFunction, Request, Response } from "express";
import type { RejectStoreSchemaType } from "@/schemas/store";
import { runAdminStoreAction } from "@/services/store/adminAction";
import { createError } from "@/utils";

export const rejectStore = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const admin = req.user;
    if (!admin) throw createError("User not authenticated", 401);

    const { reason } = req.body as RejectStoreSchemaType;
    const { store } = await runAdminStoreAction({
      storeId: String(req.params.storeId),
      admin,
      action: "reject",
      permission: "stores.reject",
      reason,
    });

    res.status(200).json({
      message: "Store rejected successfully",
      success: true,
      data: { store },
    });
  } catch (error) {
    next(error);
  }
};
