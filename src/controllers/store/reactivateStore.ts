import type { NextFunction, Request, Response } from "express";
import type { ReactivateStoreSchemaType } from "@/schemas/store";
import { runAdminStoreAction } from "@/services/store/adminAction";
import { createError } from "@/utils";

export const reactivateStore = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const admin = req.user;
    if (!admin) throw createError("User not authenticated", 401);

    const { note } = req.body as ReactivateStoreSchemaType;
    const { store } = await runAdminStoreAction({
      storeId: String(req.params.storeId),
      admin,
      action: "reactivate",
      permission: "stores.suspend",
      note: note ?? null,
    });

    res.status(200).json({
      message: "Store reactivated successfully",
      success: true,
      data: { store },
    });
  } catch (error) {
    next(error);
  }
};
