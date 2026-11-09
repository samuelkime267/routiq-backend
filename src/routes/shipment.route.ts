import { Router } from "express";
import {
  cancelShipmentAdmin,
  getShipment,
  getShipmentTracking,
  listShipments,
  refreshShipmentStatus,
  retryShipment,
  shipbubbleWebhook,
} from "@/controllers/shipment";
import {
  isAuthenticated,
  requireAdmin,
  requirePermission,
} from "@/middleware";
import { cancelShipmentValidator } from "@/validators/shipment.validator";

const shipmentRouter = Router();

// Provider webhook: authenticated by the HMAC signature, not a user session.
// It must be declared before `/:shipmentId` so Express does not capture it.
shipmentRouter.post("/webhooks/shipbubble", shipbubbleWebhook);

shipmentRouter.get(
  "/",
  isAuthenticated,
  requireAdmin,
  requirePermission("shipments.view"),
  listShipments,
);
shipmentRouter.get(
  "/:shipmentId",
  isAuthenticated,
  requireAdmin,
  requirePermission("shipments.view"),
  getShipment,
);
shipmentRouter.get(
  "/:shipmentId/tracking",
  isAuthenticated,
  requireAdmin,
  requirePermission("shipments.view"),
  getShipmentTracking,
);

// All mutating shipment operations require `shipments.manage`. Each service
// additionally rejects operations the provider does not support.
shipmentRouter.post(
  "/:shipmentId/admin/refresh",
  isAuthenticated,
  requireAdmin,
  requirePermission("shipments.manage"),
  refreshShipmentStatus,
);
shipmentRouter.post(
  "/:shipmentId/admin/retry",
  isAuthenticated,
  requireAdmin,
  requirePermission("shipments.manage"),
  retryShipment,
);
shipmentRouter.post(
  "/:shipmentId/admin/cancel",
  isAuthenticated,
  requireAdmin,
  requirePermission("shipments.manage"),
  cancelShipmentValidator,
  cancelShipmentAdmin,
);

export default shipmentRouter;
