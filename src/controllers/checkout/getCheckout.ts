import type { NextFunction, Request, Response } from "express";
import { checkoutReferenceParamSchema } from "@/schemas/checkout";
import { getCheckoutState } from "@/services/checkout/state";

export const getCheckout = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { masterOrderNumber } = checkoutReferenceParamSchema.parse(
      req.params,
    );
    const state = await getCheckoutState(
      masterOrderNumber,
      String(req.user!._id),
    );

    res.status(200).json({
      message: "Checkout retrieved successfully",
      success: true,
      data: { checkout: state },
    });
  } catch (error) {
    next(error);
  }
};
