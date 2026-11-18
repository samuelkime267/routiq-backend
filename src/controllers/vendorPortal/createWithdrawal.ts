import type { NextFunction, Request, Response } from "express";
import type { CreateWithdrawalInput } from "@/schemas/vendorPortal";
import {
  createWithdrawal,
  getVendorWithdrawal,
} from "@/services/vendorPortal/withdrawals";
import { vendorContext } from "./context";

export const createWithdrawalController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { vendor, store } = await vendorContext(req);
    const input = req.body as CreateWithdrawalInput;
    const result = await createWithdrawal(vendor, store, input);

    res.status(result.created ? 201 : 200).json({
      message: result.created
        ? "Withdrawal request submitted"
        : "Withdrawal request already submitted",
      success: true,
      data: {
        withdrawal: await getVendorWithdrawal(
          String(vendor._id),
          String(result.withdrawal._id),
        ),
        created: result.created,
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
