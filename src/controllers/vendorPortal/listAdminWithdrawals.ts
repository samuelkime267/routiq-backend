import type { NextFunction, Request, Response } from "express";
import { adminWithdrawalListQuerySchema } from "@/schemas/vendorPortal";
import { queryAdminWithdrawals } from "@/services/vendorPortal/withdrawals";

export const listAdminWithdrawalsController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const query = adminWithdrawalListQuerySchema.parse(req.query);
    const result = await queryAdminWithdrawals(query);

    res.status(200).json({
      message: "Withdrawals retrieved successfully",
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
