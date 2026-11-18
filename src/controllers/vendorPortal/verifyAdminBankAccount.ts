import type { NextFunction, Request, Response } from "express";
import { requestMetadata } from "@/lib/audit";
import { verifyVendorBankAccount } from "@/services/vendorPortal/withdrawals";

export const verifyAdminBankAccountController = async (
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

    const account = await verifyVendorBankAccount(
      actor,
      String(req.params.accountId),
      req.body as { status: "verified" | "rejected"; reason?: string },
      requestMetadata(req),
    );

    res.status(200).json({
      message: `Bank account ${account.verificationStatus}`,
      success: true,
      data: { account },
    });
  } catch (error) {
    next(error);
  }
};
