import type { NextFunction, Request, Response } from "express";
import { loadShipmentDetailById } from "@/services/shipments/query";

export const getShipment = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = await loadShipmentDetailById(String(req.params.shipmentId));

    res.status(200).json({
      message: "Shipment retrieved successfully",
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};
