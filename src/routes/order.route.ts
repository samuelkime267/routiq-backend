import { Router } from "express";
import {
  getOrder,
  getOrderTimeline,
  listOrders,
  listOrderShipments,
  listOrderSubOrders,
} from "@/controllers/order";
import {
  isAuthenticated,
  requireAdmin,
  requirePermission,
} from "@/middleware";

const orderRouter = Router();

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
