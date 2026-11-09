import type { NextFunction, Request, Response } from "express";
import {
  attachShipmentsToOrders,
  findOrderOrThrow,
  loadOrderGroupContext,
  orderTimelineForContext,
} from "@/services/orders/query";

export const getOrder = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const selected = await findOrderOrThrow(String(req.params.orderId));
    const context = await loadOrderGroupContext(selected);

    res.status(200).json({
      message: "Order retrieved successfully",
      success: true,
      data: {
        order: context.selectedOrder,
        masterOrderNumber: context.masterOrderNumber,
        summary: context.summary,
        subOrders: attachShipmentsToOrders(
          context.orders,
          context.shipments,
          context.payments,
          context.escrows,
        ),
        payments: context.payments,
        escrows: context.escrows,
        shipments: context.shipments,
        timeline: orderTimelineForContext(context),
      },
    });
  } catch (error) {
    next(error);
  }
};
