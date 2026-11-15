import type { NextFunction, Request, Response } from "express";
import { processPaystackWebhook } from "@/services/payments/webhook";

/**
 * Paystack webhook endpoint.
 *
 * The raw body captured by `express.json` is used for the HMAC check. A
 * duplicate delivery is acknowledged with 200 so Paystack stops retrying; an
 * invalid signature is rejected with 401.
 */
export const paymentWebhook = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const rawBody =
      (req as Request & { rawBody?: Buffer }).rawBody ?? req.body;
    const result = await processPaystackWebhook({
      rawBody: rawBody as Buffer | string,
      signature: req.headers["x-paystack-signature"] as string | undefined,
      payload: req.body,
    });

    res.status(200).json({
      message: result.message,
      success: true,
      data: { status: result.status },
    });
  } catch (error) {
    next(error);
  }
};
