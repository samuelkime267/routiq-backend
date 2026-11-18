import type { NextFunction, Request, Response } from "express";
import type { CreateBankAccountInput } from "@/schemas/vendorPortal";
import { createBankAccount } from "@/services/vendorPortal/withdrawals";
import { vendorContext } from "./context";

export const createVendorBankAccountController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { vendor, store } = await vendorContext(req);
    const account = await createBankAccount(
      vendor,
      store,
      req.body as CreateBankAccountInput,
    );

    res.status(201).json({
      message: "Bank account added. It will be verified before withdrawals can use it.",
      success: true,
      data: { account },
    });
  } catch (error) {
    next(error);
  }
};
