import type { NextFunction, Request, Response } from "express";
import { vendorFinanceQuerySchema } from "@/schemas/vendorPortal";
import {
  getVendorFinanceAnalytics,
  getVendorFinanceSummary,
} from "@/services/vendorPortal/finance";
import { vendorContext } from "./context";

export const getVendorFinanceController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { vendor } = await vendorContext(req);
    const query = vendorFinanceQuerySchema.parse(req.query);
    const [summary, analytics] = await Promise.all([
      getVendorFinanceSummary(String(vendor._id)),
      getVendorFinanceAnalytics(String(vendor._id), query),
    ]);

    res.status(200).json({
      message: "Finance retrieved successfully",
      success: true,
      data: { ...summary, analytics },
    });
  } catch (error) {
    next(error);
  }
};
