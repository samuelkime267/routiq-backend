import type { NextFunction, Request, Response } from "express";
import {
  cancelVendorWithdrawal,
  findVendorWithdrawalDocument,
} from "@/services/vendorPortal/withdrawals";
import { vendorContext } from "./context";

export const cancelVendorWithdrawalController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { vendor } = await vendorContext(req);
    const withdrawal = await findVendorWithdrawalDocument(
      String(vendor._id),
      String(req.params.withdrawalId),
    );
    const { reason } = req.body as { reason?: string };
    const result = await cancelVendorWithdrawal(
      vendor,
      withdrawal,
      reason ?? null,
    );

    res.status(200).json({
      message: "Withdrawal cancelled",
      success: true,
      data: {
        withdrawal: result.withdrawal,
        balance: {
          availableBalance: result.ledger.availableBalance,
          settledEarnings: result.ledger.settledEarnings,
          reserved: result.ledger.withdrawalPending,
          withdrawn: result.ledger.withdrawn,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};
