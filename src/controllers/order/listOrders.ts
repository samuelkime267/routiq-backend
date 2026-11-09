import type { NextFunction, Request, Response } from "express";
import { listOrdersQuerySchema } from "@/schemas/order";
import { queryOrders } from "@/services/orders/query";

export const listOrders = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const query = listOrdersQuerySchema.parse(req.query);
    const result = await queryOrders(query);

    res.status(200).json({
      message: "Orders retrieved successfully",
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
