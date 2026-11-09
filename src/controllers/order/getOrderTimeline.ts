import type { NextFunction, Request, Response } from "express";
import { orderTimelineQuerySchema } from "@/schemas/order";
import {
  findOrderOrThrow,
  loadOrderGroupContext,
  orderTimelineForContext,
} from "@/services/orders/query";
import { paginateTimeline } from "@/services/orders/timeline";

export const getOrderTimeline = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const query = orderTimelineQuerySchema.parse(req.query);
    const selected = await findOrderOrThrow(String(req.params.orderId));
    const context = await loadOrderGroupContext(selected);

    const events = orderTimelineForContext(context).filter(
      (event) => !query.type || event.type === query.type,
    );

    const result = paginateTimeline(events, query.page, query.limit);

    res.status(200).json({
      message: "Order timeline retrieved successfully",
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
