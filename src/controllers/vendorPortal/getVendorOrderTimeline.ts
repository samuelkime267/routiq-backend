import type { NextFunction, Request, Response } from "express";
import { vendorOrderTimelineQuerySchema } from "@/schemas/vendorPortal";
import { getVendorOrderTimeline } from "@/services/vendorPortal/orders";
import { vendorContext } from "./context";

export const getVendorOrderTimelineController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { vendor } = await vendorContext(req);
    const { page, limit } = vendorOrderTimelineQuerySchema.parse(req.query);
    const result = await getVendorOrderTimeline(
      String(vendor._id),
      String(req.params.orderId),
      page,
      limit,
    );

    res.status(200).json({
      message: "Order timeline retrieved successfully",
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
