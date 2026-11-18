import type { NextFunction, Request, Response } from "express";
import { vendorOrderListQuerySchema } from "@/schemas/vendorPortal";
import { queryVendorOrders } from "@/services/vendorPortal/orders";
import { vendorContext } from "./context";

export const listVendorOrdersController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { vendor } = await vendorContext(req);
    const query = vendorOrderListQuerySchema.parse(req.query);
    const result = await queryVendorOrders(String(vendor._id), query);

    res.status(200).json({
      message: "Orders retrieved successfully",
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
