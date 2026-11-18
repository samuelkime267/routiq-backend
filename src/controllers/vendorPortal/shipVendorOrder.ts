import type { NextFunction, Request, Response } from "express";
import { findVendorOrder, shipVendorOrder } from "@/services/vendorPortal/orders";
import { vendorContext } from "./context";

export const shipVendorOrderController = async (
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
    const result = await shipVendorOrder(
      vendor,
      store,
      order,
      req.body as {
        courierName: string;
        trackingNumber: string;
        trackingUrl?: string;
        estimatedDeliveryAt?: string;
        note?: string;
      },
    );

    res.status(200).json({
      message: "Shipment recorded successfully",
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
