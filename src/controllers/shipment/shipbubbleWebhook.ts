import type { NextFunction, Request, Response } from "express";
import { createError } from "@/utils";
import { processShipbubbleWebhook } from "@/services/shipments/webhook";

/**
 * Shipbubble webhook receiver.
 *
 * This endpoint is authenticated by the provider's HMAC signature, not by a
 * user session. The raw request body is captured by the JSON middleware in
 * `app.ts` because the signature covers the exact bytes sent.
 */
export const shipbubbleWebhook = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;

    if (!rawBody) {
      throw createError("Webhook raw body is unavailable", 400);
    }

    const result = await processShipbubbleWebhook({
      rawBody,
      signature:
        (req.headers["x-ship-signature"] as string | undefined) ??
        (req.headers["x-shipbubble-signature"] as string | undefined) ??
        null,
      payload: req.body,
    });

    res.status(200).json({
      message: result.message,
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
