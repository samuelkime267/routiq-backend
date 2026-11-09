import type { NextFunction, Request, Response } from "express";
import { listShipmentsQuerySchema } from "@/schemas/shipment";
import { queryShipments } from "@/services/shipments/query";

export const listShipments = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const query = listShipmentsQuerySchema.parse(req.query);
    const result = await queryShipments(query);

    res.status(200).json({
      message: "Shipments retrieved successfully",
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
