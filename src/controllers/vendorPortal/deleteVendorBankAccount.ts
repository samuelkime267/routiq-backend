import type { NextFunction, Request, Response } from "express";
import {
  deleteBankAccount,
  findVendorBankAccountDocument,
} from "@/services/vendorPortal/withdrawals";
import { vendorContext } from "./context";

export const deleteVendorBankAccountController = async (
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
    const result = await deleteBankAccount(String(vendor._id), account);

    res.status(200).json({
      message: result.archived
        ? "Bank account removed from your profile. Existing withdrawals keep their original details."
        : "Bank account deleted",
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
