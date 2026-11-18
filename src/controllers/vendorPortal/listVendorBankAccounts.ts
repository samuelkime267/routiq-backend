import type { NextFunction, Request, Response } from "express";
import { listVendorBankAccounts } from "@/services/vendorPortal/withdrawals";
import { vendorContext } from "./context";

export const listVendorBankAccountsController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { vendor, store } = await vendorContext(req);
    const result = await listVendorBankAccounts(String(vendor._id), store);

    res.status(200).json({
      message: "Bank accounts retrieved successfully",
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
