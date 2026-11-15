import type { NextFunction, Request, Response } from "express";
import { checkoutReferenceParamSchema } from "@/schemas/checkout";
import { verifyCheckoutPayment } from "@/services/payments/verify";

/**
 * Verifies a checkout server-to-server. The customer's browser cannot assert a
 * successful payment: the amount and status come from the provider.
 */
export const verifyPayment = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { masterOrderNumber } = checkoutReferenceParamSchema.parse(
      req.params,
    );
    const result = await verifyCheckoutPayment({
      masterOrderNumber,
      customerId: String(req.user!._id),
    });

    res.status(200).json({
      message: result.message,
      success: true,
      data: { payment: result },
    });
  } catch (error) {
    next(error);
  }
};
