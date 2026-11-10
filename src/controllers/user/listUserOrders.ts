import type { NextFunction, Request, Response } from "express";
import { userOrdersQuerySchema } from "@/schemas/user";
import { findUserOrThrow, queryUserOrders } from "@/services/users/query";

export const listUserOrders = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const query = userOrdersQuerySchema.parse(req.query);
    const user = await findUserOrThrow(String(req.params.userId));
    const result = await queryUserOrders(user, query);

    res.status(200).json({
      message: "User orders retrieved successfully",
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
