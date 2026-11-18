import type { NextFunction, Request, Response } from "express";
import { requestMetadata } from "@/lib/audit";
import {
  decideWithdrawal,
  type AdminDecisionInput,
} from "@/services/vendorPortal/withdrawals";

export const decideAdminWithdrawalController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const actor = req.user;

    if (!actor) {
      res.status(401).json({ success: false, message: "User not authenticated" });
      return;
    }

    const result = await decideWithdrawal(
      actor,
      String(req.params.withdrawalId),
      req.body as AdminDecisionInput,
      requestMetadata(req),
    );

    res.status(200).json({
      message: `Withdrawal ${result.withdrawal.status}`,
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
