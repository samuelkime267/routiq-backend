import type { NextFunction, Request, Response } from "express";
import { customerOrdersQuerySchema } from "@/schemas/order";
import { queryCustomerOrders } from "@/services/orders/customer";

export const listCustomerOrders = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const query = customerOrdersQuerySchema.parse(req.query);
    const result = await queryCustomerOrders(String(req.user!._id), query);

    res.status(200).json({
      message: "Orders retrieved successfully",
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
