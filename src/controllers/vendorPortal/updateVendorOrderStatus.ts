import type { NextFunction, Request, Response } from "express";
import {
  findVendorOrder,
  transitionVendorOrder,
} from "@/services/vendorPortal/orders";
import { vendorContext } from "./context";

export const updateVendorOrderStatusController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { vendor, store } = await vendorContext(req);
    const order = await findVendorOrder(
      String(vendor._id),
      String(req.params.orderId),
    );
    const { status, reason } = req.body as {
      status: "confirmed" | "processing" | "delivered" | "cancelled";
      reason?: string;
    };
    const updated = await transitionVendorOrder(
      vendor,
      store,
      order,
      status,
      reason ?? null,
    );

    res.status(200).json({
      message: `Order marked ${status}`,
      success: true,
      data: { order: updated },
    });
  } catch (error) {
    next(error);
  }
};
