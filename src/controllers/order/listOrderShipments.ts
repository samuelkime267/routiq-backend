import type { NextFunction, Request, Response } from "express";
import { orderShipmentsQuerySchema } from "@/schemas/order";
import { findOrderOrThrow, queryOrderShipments } from "@/services/orders/query";

export const listOrderShipments = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const query = orderShipmentsQuerySchema.parse(req.query);
    const selected = await findOrderOrThrow(String(req.params.orderId));
    const result = await queryOrderShipments(selected, query);

    res.status(200).json({
      message: "Order shipments retrieved successfully",
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
