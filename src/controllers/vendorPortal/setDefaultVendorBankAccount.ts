import type { NextFunction, Request, Response } from "express";
import {
  findVendorBankAccountDocument,
  setDefaultBankAccount,
} from "@/services/vendorPortal/withdrawals";
import { vendorContext } from "./context";

export const setDefaultVendorBankAccountController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { vendor } = await vendorContext(req);
    const account = await findVendorBankAccountDocument(
      String(vendor._id),
      String(req.params.accountId),
    );
    const updated = await setDefaultBankAccount(String(vendor._id), account);

    res.status(200).json({
      message: "Default payout account updated",
      success: true,
      data: { account: updated },
    });
  } catch (error) {
    next(error);
  }
};
