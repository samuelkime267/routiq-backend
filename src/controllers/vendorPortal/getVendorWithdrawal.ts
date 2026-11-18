import type { NextFunction, Request, Response } from "express";
import { getVendorWithdrawal } from "@/services/vendorPortal/withdrawals";
import { vendorContext } from "./context";

export const getVendorWithdrawalController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { vendor } = await vendorContext(req);
    const withdrawal = await getVendorWithdrawal(
      String(vendor._id),
      String(req.params.withdrawalId),
    );

    res.status(200).json({
      message: "Withdrawal retrieved successfully",
      success: true,
      data: { withdrawal },
    });
  } catch (error) {
    next(error);
  }
};
