import type { NextFunction, Request, Response } from "express";
import type { RequestStoreInformationSchemaType } from "@/schemas/store";
import { runAdminStoreAction } from "@/services/store/adminAction";
import { createError } from "@/utils";

export const requestStoreInformation = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const admin = req.user;
    if (!admin) throw createError("User not authenticated", 401);

    const { message } = req.body as RequestStoreInformationSchemaType;
    const { store } = await runAdminStoreAction({
      storeId: String(req.params.storeId),
      admin,
      action: "request_information",
      permission: "stores.approve",
      message,
    });

    res.status(200).json({
      message: "Information request sent to the vendor",
      success: true,
      data: { store },
    });
  } catch (error) {
    next(error);
  }
};
