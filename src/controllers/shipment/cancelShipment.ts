import type { NextFunction, Request, Response } from "express";
import { actorFromUser } from "@/lib/activity";
import { cancelShipmentSchema } from "@/schemas/shipment";
import { cancelShipment } from "@/services/shipments/sync";

export const cancelShipmentAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { reason } = cancelShipmentSchema.parse(req.body ?? {});
    const { shipment } = await cancelShipment(
      String(req.params.shipmentId),
      { reason: reason ?? null },
      actorFromUser(req.user),
    );

    res.status(200).json({
      message: "Shipment cancelled successfully",
      success: true,
      data: { shipment },
    });
  } catch (error) {
    next(error);
  }
};
