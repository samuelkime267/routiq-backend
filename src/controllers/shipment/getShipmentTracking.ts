import type { NextFunction, Request, Response } from "express";
import { shipmentTrackingQuerySchema } from "@/schemas/shipment";
import { loadShipmentTracking } from "@/services/shipments/query";

export const getShipmentTracking = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const query = shipmentTrackingQuerySchema.parse(req.query);
    const result = await loadShipmentTracking(
      String(req.params.shipmentId),
      query,
    );

    res.status(200).json({
      message: "Shipment tracking retrieved successfully",
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
