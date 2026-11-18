import type { NextFunction, Request, Response } from "express";
import { getVendorOrderDetail } from "@/services/vendorPortal/orders";
import { vendorContext } from "./context";

export const getVendorOrderController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { vendor } = await vendorContext(req);
    const result = await getVendorOrderDetail(
      String(vendor._id),
      String(req.params.orderId),
    );

    res.status(200).json({
      message: "Order retrieved successfully",
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
