import { Router } from "express";
import {
  listFeaturedProducts,
  listNewArrivals,
  listOnSaleProducts,
  listPopularProducts,
  listTrendingProducts,
} from "@/controllers/marketplace";
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
  archiveVendorProductController,
  createVendorProductController,
  deleteVendorProductController,
  getVendorProductController,
  listVendorProductsController,
  setVendorProductPublicationController,
  submitVendorProductController,
  updateVendorProductController,
  updateVendorProductStockController,
} from "@/controllers/vendorPortal";
import {
  isAuthenticated,
  authorizeRoles,
  optionalAuth,
  requireAdmin,
  requirePermission,
} from "@/middleware";
import {
  approveProductValidator,
  rejectProductValidator,
  restoreProductValidator,
  suspendProductValidator,
} from "@/validators/product.validator";
import {
  createVendorProductValidator,
  setVendorProductPublicationValidator,
  updateVendorProductValidator,
  updateVendorStockValidator,
} from "@/validators/vendorPortal.validator";

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

// Vendor catalogue management. Declared before the public `/` and `/:productId`
// routes so `/vendor` is never captured as a product id. Ownership is resolved
// from the access token inside every controller.
productRouter.get(
  "/vendor",
  isAuthenticated,
  authorizeRoles("vendor"),
  listVendorProductsController,
);
productRouter.post(
  "/vendor",
  isAuthenticated,
  authorizeRoles("vendor"),
  createVendorProductValidator,
  createVendorProductController,
);
productRouter.get(
  "/vendor/:productId",
  isAuthenticated,
  authorizeRoles("vendor"),
  getVendorProductController,
);
productRouter.patch(
  "/vendor/:productId",
  isAuthenticated,
  authorizeRoles("vendor"),
  updateVendorProductValidator,
  updateVendorProductController,
);
productRouter.patch(
  "/vendor/:productId/stock",
  isAuthenticated,
  authorizeRoles("vendor"),
  updateVendorStockValidator,
  updateVendorProductStockController,
);
productRouter.post(
  "/vendor/:productId/submit",
  isAuthenticated,
  authorizeRoles("vendor"),
  submitVendorProductController,
);
productRouter.patch(
  "/vendor/:productId/publication",
  isAuthenticated,
  authorizeRoles("vendor"),
  setVendorProductPublicationValidator,
  setVendorProductPublicationController,
);
productRouter.post(
  "/vendor/:productId/archive",
  isAuthenticated,
  authorizeRoles("vendor"),
  archiveVendorProductController,
);
productRouter.delete(
  "/vendor/:productId",
  isAuthenticated,
  authorizeRoles("vendor"),
  deleteVendorProductController,
);

// Public marketplace shelves. Declared before `/:productId` so Express does
// not treat `featured` as a product id.
productRouter.get("/featured", optionalAuth, listFeaturedProducts);
productRouter.get("/popular", optionalAuth, listPopularProducts);
productRouter.get("/trending", optionalAuth, listTrendingProducts);
productRouter.get("/new-arrivals", optionalAuth, listNewArrivals);
productRouter.get("/on-sale", optionalAuth, listOnSaleProducts);

// Dual-mode: administrators receive the moderation console response, while
// anonymous and customer requests receive only publicly visible products.
productRouter.get("/", optionalAuth, listProducts);
productRouter.get("/:productId", optionalAuth, getProduct);

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
