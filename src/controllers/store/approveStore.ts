import type { NextFunction, Request, Response } from "express";
import type { ApproveStoreSchemaType } from "@/schemas/store";
import { runAdminStoreAction } from "@/services/store/adminAction";
import { createError } from "@/utils";

export const approveStore = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const admin = req.user;
    if (!admin) throw createError("User not authenticated", 401);

    const { note } = req.body as ApproveStoreSchemaType;
    const { store } = await runAdminStoreAction({
      storeId: String(req.params.storeId),
      admin,
      action: "approve",
      permission: "stores.approve",
      note: note ?? null,
    });

    res.status(200).json({
      message: "Store approved successfully",
      success: true,
      data: { store },
    });
  } catch (error) {
    next(error);
  }
};
