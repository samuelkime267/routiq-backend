import { Router } from "express";
import {
  approveProduct,
  getProduct,
  listPendingProducts,
  listProductFilters,
  listProducts,
  rejectProduct,
  restoreProduct,
  suspendProduct,
} from "@/controllers/product";
import {
  isAuthenticated,
  requireAdmin,
  requirePermission,
} from "@/middleware";
import {
  approveProductValidator,
  rejectProductValidator,
  restoreProductValidator,
  suspendProductValidator,
} from "@/validators/product.validator";

const productRouter = Router();

// Static paths must be declared before `/:productId` so they are not captured
// as ids by Express.
productRouter.get(
  "/filters",
  isAuthenticated,
  requireAdmin,
  requirePermission("products.view"),
  listProductFilters,
);
productRouter.get(
  "/pending",
  isAuthenticated,
  requireAdmin,
  requirePermission("products.view"),
  listPendingProducts,
);
productRouter.get(
  "/",
  isAuthenticated,
  requireAdmin,
  requirePermission("products.view"),
  listProducts,
);
productRouter.get(
  "/:productId",
  isAuthenticated,
  requireAdmin,
  requirePermission("products.view"),
  getProduct,
);

// Every moderation action needs `products.moderate`; the workflow additionally
// validates the current moderation state before changing anything.
productRouter.post(
  "/:productId/admin/approve",
  isAuthenticated,
  requireAdmin,
  requirePermission("products.moderate"),
  approveProductValidator,
  approveProduct,
);
productRouter.post(
  "/:productId/admin/reject",
  isAuthenticated,
  requireAdmin,
  requirePermission("products.moderate"),
  rejectProductValidator,
  rejectProduct,
);
productRouter.post(
  "/:productId/admin/suspend",
  isAuthenticated,
  requireAdmin,
  requirePermission("products.moderate"),
  suspendProductValidator,
  suspendProduct,
);
productRouter.post(
  "/:productId/admin/restore",
  isAuthenticated,
  requireAdmin,
  requirePermission("products.moderate"),
  restoreProductValidator,
  restoreProduct,
);

export default productRouter;
