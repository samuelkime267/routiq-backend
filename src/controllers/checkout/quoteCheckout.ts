import type { NextFunction, Request, Response } from "express";
import type { CheckoutQuoteInput } from "@/schemas/checkout";
import { buildCheckoutQuote } from "@/services/checkout/quote";

/**
 * Authoritative checkout summary.
 *
 * Delivery is re-quoted on every call, so changing the address or a delivery
 * option updates fees without the client ever computing money itself.
 */
export const quoteCheckout = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const body = req.body as CheckoutQuoteInput;
    const quote = await buildCheckoutQuote({
      customerId: String(req.user!._id),
      items: body.items,
      addressId: body.addressId ?? null,
      deliverySelections: body.deliverySelections,
    });

    res.status(200).json({
      message: quote.blocking
        ? "Review the issues below before checking out"
        : "Checkout summary retrieved successfully",
      success: true,
      data: { quote },
    });
  } catch (error) {
    next(error);
  }
};
