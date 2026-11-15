import type { NextFunction, Request, Response } from "express";
import type { PlaceCheckoutBody } from "@/schemas/checkout";
import {
  placeCheckout as placeCheckoutService,
  type PlaceCheckoutOutcome,
} from "@/services/checkout/place";

function respond(outcome: PlaceCheckoutOutcome, res: Response) {
  if (outcome.kind === "blocked" || outcome.kind === "price_changed") {
    res.status(409).json({
      message: outcome.message,
      success: false,
      data: { quote: outcome.quote, reason: outcome.kind },
    });
    return;
  }

  if (outcome.kind === "payment_unavailable") {
    res.status(503).json({
      message: outcome.message,
      success: false,
      data: { reason: outcome.kind },
    });
    return;
  }

  res.status(201).json({
    message: outcome.resumed
      ? "Checkout resumed successfully"
      : "Order placed successfully",
    success: true,
    data: {
      resumed: outcome.resumed,
      masterOrderNumber: outcome.masterOrderNumber,
      orders: outcome.orders,
      summary: outcome.summary,
      payment: outcome.payment,
    },
  });
}

export const placeCheckout = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const body = req.body as PlaceCheckoutBody;
    const outcome = await placeCheckoutService({
      customer: req.user!,
      key: body.key,
      items: body.items,
      addressId: body.addressId,
      deliverySelections: body.deliverySelections,
      expectedTotal: body.expectedTotal ?? null,
    });

    respond(outcome, res);
  } catch (error) {
    next(error);
  }
};
