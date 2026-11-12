import type { NextFunction, Request, Response } from "express";
import { actorFromUser } from "@/lib/activity";
import { auditActorFromUser, recordAudit, requestMetadata } from "@/lib/audit";
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

    await recordAudit({
      actor: auditActorFromUser(req.user),
      action: "shipment.retried",
      entityType: "shipment",
      entityId: shipment._id,
      entityLabel: shipment.trackingNumber,
      previousState: null,
      newState: { status: shipment.status },
      request: requestMetadata(req),
    });

    res.status(200).json({
      message: "Shipment retry completed",
      success: true,
      data: { shipment },
    });
  } catch (error) {
    next(error);
  }
};
