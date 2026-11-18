import type { NextFunction, Request, Response } from "express";
import { queryAdminBankAccounts } from "@/services/vendorPortal/withdrawals";

export const listAdminBankAccountsController = async (
  _req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await queryAdminBankAccounts();

    res.status(200).json({
      message: "Bank accounts retrieved successfully",
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
