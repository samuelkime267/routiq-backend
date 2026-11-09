import type { NextFunction, Request, Response } from "express";
import { actorFromUser } from "@/lib/activity";
import { retryShipmentSync } from "@/services/shipments/sync";

export const retryShipment = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { shipment } = await retryShipmentSync(
      String(req.params.shipmentId),
      actorFromUser(req.user),
    );

    res.status(200).json({
      message: "Shipment retry completed",
      success: true,
      data: { shipment },
    });
  } catch (error) {
    next(error);
  }
};
