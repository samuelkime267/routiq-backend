import type { NextFunction, Request, Response } from "express";
import { customerOrderParamSchema } from "@/schemas/order";
import { getCustomerOrderGroup } from "@/services/orders/customer";

export const getCustomerOrder = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { reference } = customerOrderParamSchema.parse(req.params);
    const order = await getCustomerOrderGroup(
      String(req.user!._id),
      reference,
    );

    res.status(200).json({
      message: "Order retrieved successfully",
      success: true,
      data: { order },
    });
  } catch (error) {
    next(error);
  }
};
