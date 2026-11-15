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
  authorizeRoles,
  isAuthenticated,
  requireAdmin,
  requirePermission,
} from "@/middleware";

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
