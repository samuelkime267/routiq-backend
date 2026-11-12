import type { NextFunction, Request, Response } from "express";
import { actorFromUser } from "@/lib/activity";
import { auditActorFromUser, recordAudit, requestMetadata } from "@/lib/audit";
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

    await recordAudit({
      actor: auditActorFromUser(req.user),
      action: "shipment.refreshed",
      entityType: "shipment",
      entityId: shipment._id,
      entityLabel: shipment.trackingNumber,
      previousState: null,
      newState: {
        status: shipment.status,
        providerStatus: shipment.providerStatus ?? null,
      },
      request: requestMetadata(req),
    });

    res.status(200).json({
      message: "Shipment synchronised with Shipbubble",
      success: true,
      data: { shipment },
    });
  } catch (error) {
    next(error);
  }
};
