import type { NextFunction, Request, Response } from "express";
import { vendorWithdrawalListQuerySchema } from "@/schemas/vendorPortal";
import { listVendorWithdrawals } from "@/services/vendorPortal/withdrawals";
import { vendorContext } from "./context";

export const listVendorWithdrawalsController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { vendor } = await vendorContext(req);
    const query = vendorWithdrawalListQuerySchema.parse(req.query);
    const result = await listVendorWithdrawals(String(vendor._id), query);

    res.status(200).json({
      message: "Withdrawals retrieved successfully",
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
