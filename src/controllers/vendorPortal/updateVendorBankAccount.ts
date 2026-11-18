import type { NextFunction, Request, Response } from "express";
import type { UpdateBankAccountInput } from "@/schemas/vendorPortal";
import {
  findVendorBankAccountDocument,
  updateBankAccount,
} from "@/services/vendorPortal/withdrawals";
import { vendorContext } from "./context";

export const updateVendorBankAccountController = async (
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
    const updated = await updateBankAccount(
      String(vendor._id),
      account,
      req.body as UpdateBankAccountInput,
    );

    res.status(200).json({
      message: "Bank account updated",
      success: true,
      data: { account: updated },
    });
  } catch (error) {
    next(error);
  }
};
