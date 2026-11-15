import type { NextFunction, Request, Response } from "express";
import { paymentProviderStatus } from "@/services/payments/paystack";

/**
 * Payment methods are whatever the configured provider supports, plus the
 * currency. The UI renders this list instead of hard-coding channels.
 */
export const listPaymentMethods = async (
  _req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const provider = paymentProviderStatus();

    res.status(200).json({
      message: "Payment methods retrieved successfully",
      success: true,
      data: {
        currency: "NGN",
        ...provider,
        methods: provider.channels,
      },
    });
  } catch (error) {
    next(error);
  }
};
