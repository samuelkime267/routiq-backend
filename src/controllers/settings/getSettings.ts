import type { NextFunction, Request, Response } from "express";
import { getPlatformSettings } from "@/services/settings";

export const getSettings = async (
  _req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const settings = await getPlatformSettings();

    res.status(200).json({
      message: "Platform settings retrieved successfully",
      success: true,
      data: {
        settings,
        /**
         * Surfaced explicitly so the console can explain that these settings
         * never rewrite an existing payment, escrow entry or settlement.
         */
        financialPolicy: {
          commissionSnapshot: true,
          escrowManagedBy: "payments-and-escrow",
          note: "Commission is captured on each payment when it is recorded. Changing the rate here affects future pricing only.",
        },
      },
    });
  } catch (error) {
    next(error);
  }
};
