import type { NextFunction, Request, Response } from "express";
import { checkoutReferenceParamSchema } from "@/schemas/checkout";
import { retryCheckoutPayment } from "@/services/checkout/place";

/**
 * Starts a new payment attempt for an existing checkout. Orders and the stock
 * reservation are kept; only the provider transaction is replaced.
 */
export const retryPayment = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { masterOrderNumber } = checkoutReferenceParamSchema.parse(
      req.params,
    );
    const outcome = await retryCheckoutPayment(
      masterOrderNumber,
      String(req.user!._id),
    );

    if (outcome.kind !== "placed") {
      res.status(409).json({
        message: outcome.message,
        success: false,
        data: {
          reason: outcome.kind,
          ...(outcome.kind === "blocked" || outcome.kind === "price_changed"
            ? { quote: outcome.quote }
            : {}),
        },
      });
      return;
    }

    res.status(200).json({
      message:
        outcome.payment.status === "paid"
          ? "Payment already confirmed"
          : "Payment attempt restarted",
      success: true,
      data: {
        masterOrderNumber: outcome.masterOrderNumber,
        summary: outcome.summary,
        payment: outcome.payment,
      },
    });
  } catch (error) {
    next(error);
  }
};
