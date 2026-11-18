import type { NextFunction, Request, Response } from "express";
import { vendorTransactionListQuerySchema } from "@/schemas/vendorPortal";
import { queryVendorTransactions } from "@/services/vendorPortal/transactions";
import { vendorContext } from "./context";

export const listVendorTransactionsController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { vendor } = await vendorContext(req);
    const query = vendorTransactionListQuerySchema.parse(req.query);
    const result = await queryVendorTransactions(String(vendor._id), query);

    res.status(200).json({
      message: "Transactions retrieved successfully",
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
