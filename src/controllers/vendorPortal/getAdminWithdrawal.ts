import type { NextFunction, Request, Response } from "express";
import { getAdminWithdrawal } from "@/services/vendorPortal/withdrawals";

export const getAdminWithdrawalController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const withdrawal = await getAdminWithdrawal(
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
