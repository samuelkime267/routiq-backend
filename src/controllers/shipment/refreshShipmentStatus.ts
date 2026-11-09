import type { NextFunction, Request, Response } from "express";
import { actorFromUser } from "@/lib/activity";
import { refreshShipment } from "@/services/shipments/sync";

export const refreshShipmentStatus = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { shipment } = await refreshShipment(
      String(req.params.shipmentId),
      actorFromUser(req.user),
    );

    res.status(200).json({
      message: "Shipment synchronised with Shipbubble",
      success: true,
      data: { shipment },
    });
  } catch (error) {
    next(error);
  }
};
