import { Router } from "express";
import {
  getCustomerOrder,
  getOrder,
  getOrderTimeline,
  listCustomerOrders,
  listOrders,
  listOrderShipments,
  listOrderSubOrders,
} from "@/controllers/order";
import {
  getVendorOrderController,
  getVendorOrderTimelineController,
  listVendorOrdersController,
  shipVendorOrderController,
  updateVendorOrderStatusController,
} from "@/controllers/vendorPortal";
import {
  authorizeRoles,
  isAuthenticated,
  requireAdmin,
  requirePermission,
} from "@/middleware";
import {
  vendorOrderStatusValidator,
  vendorShipOrderValidator,
} from "@/validators/vendorPortal.validator";

const orderRouter = Router();

// Customer routes are scoped to the access token's owner and must be declared
// before the admin `/:orderId` route.
orderRouter.get(
  "/customer",
  isAuthenticated,
  authorizeRoles("user"),
  listCustomerOrders,
);
orderRouter.get(
  "/customer/:reference",
  isAuthenticated,
  authorizeRoles("user"),
  getCustomerOrder,
);

// Vendor fulfilment routes. The vendor id is resolved from the token, and the
// response contains only that vendor's own sub-order records.
orderRouter.get(
  "/vendor",
  isAuthenticated,
  authorizeRoles("vendor"),
  listVendorOrdersController,
);
orderRouter.get(
  "/vendor/:orderId",
  isAuthenticated,
  authorizeRoles("vendor"),
  getVendorOrderController,
);
orderRouter.get(
  "/vendor/:orderId/timeline",
  isAuthenticated,
  authorizeRoles("vendor"),
  getVendorOrderTimelineController,
);
orderRouter.post(
  "/vendor/:orderId/status",
  isAuthenticated,
  authorizeRoles("vendor"),
  vendorOrderStatusValidator,
  updateVendorOrderStatusController,
);
orderRouter.post(
  "/vendor/:orderId/shipment",
  isAuthenticated,
  authorizeRoles("vendor"),
  vendorShipOrderValidator,
  shipVendorOrderController,
);

orderRouter.get(
  "/",
  isAuthenticated,
  requireAdmin,
  requirePermission("orders.view"),
  listOrders,
);
orderRouter.get(
  "/:orderId",
  isAuthenticated,
  requireAdmin,
  requirePermission("orders.view"),
  getOrder,
);
orderRouter.get(
  "/:orderId/timeline",
  isAuthenticated,
  requireAdmin,
  requirePermission("orders.view"),
  getOrderTimeline,
);
orderRouter.get(
  "/:orderId/sub-orders",
  isAuthenticated,
  requireAdmin,
  requirePermission("orders.view"),
  listOrderSubOrders,
);
orderRouter.get(
  "/:orderId/shipments",
  isAuthenticated,
  requireAdmin,
  requirePermission("orders.view"),
  listOrderShipments,
);

export default orderRouter;
