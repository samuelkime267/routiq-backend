import { Router } from "express";
import {
  listFeaturedStores,
  listStoreProducts,
} from "@/controllers/marketplace";
import {
  approveStore,
  createStore,
  getAdminStore,
  getMyStores,
  getStore,
  listStoreHistory,
  listStores,
  reactivateStore,
  rejectStore,
  requestStoreInformation,
  reviewStore,
  suspendStore,
  updateStore,
} from "@/controllers/store";
import {
  authorizeRoles,
  isAuthenticated,
  optionalAuth,
  requireAdmin,
  requirePermission,
} from "@/middleware";
import {
  approveStoreValidator,
  createStoreValidator,
  reactivateStoreValidator,
  rejectStoreValidator,
  requestStoreInformationValidator,
  reviewStoreValidator,
  suspendStoreValidator,
  updateStoreValidator,
} from "@/validators/store.validator";

const storeRouter = Router();

storeRouter.post(
  "/",
  isAuthenticated,
  authorizeRoles("vendor", "admin"),
  createStoreValidator,
  createStore,
);
storeRouter.get(
  "/me",
  isAuthenticated,
  authorizeRoles("vendor", "admin"),
  getMyStores,
);

// Public marketplace routes. `/featured` and `/:storeId/products` must precede
// `/:id` so they are not captured as store ids.
storeRouter.get("/featured", optionalAuth, listFeaturedStores);
storeRouter.get("/:storeId/products", optionalAuth, listStoreProducts);

// Dual-mode: administrators receive the moderation console response, while
// anonymous and customer requests receive only public storefronts.
storeRouter.get("/", optionalAuth, listStores);

// Administrative review console. Every route is permission-gated and the
// controller re-checks the specific action permission before mutating state.
storeRouter.get(
  "/:storeId/admin",
  isAuthenticated,
  requireAdmin,
  requirePermission("stores.view"),
  getAdminStore,
);
storeRouter.get(
  "/:storeId/admin/history",
  isAuthenticated,
  requireAdmin,
  requirePermission("stores.view"),
  listStoreHistory,
);
storeRouter.post(
  "/:storeId/admin/approve",
  isAuthenticated,
  requireAdmin,
  requirePermission("stores.approve"),
  approveStoreValidator,
  approveStore,
);
storeRouter.post(
  "/:storeId/admin/reject",
  isAuthenticated,
  requireAdmin,
  requirePermission("stores.reject"),
  rejectStoreValidator,
  rejectStore,
);
storeRouter.post(
  "/:storeId/admin/request-information",
  isAuthenticated,
  requireAdmin,
  requirePermission("stores.approve"),
  requestStoreInformationValidator,
  requestStoreInformation,
);
storeRouter.post(
  "/:storeId/admin/suspend",
  isAuthenticated,
  requireAdmin,
  requirePermission("stores.suspend"),
  suspendStoreValidator,
  suspendStore,
);
storeRouter.post(
  "/:storeId/admin/reactivate",
  isAuthenticated,
  requireAdmin,
  requirePermission("stores.suspend"),
  reactivateStoreValidator,
  reactivateStore,
);

storeRouter.get("/:id", optionalAuth, getStore);
storeRouter.patch(
  "/:id",
  isAuthenticated,
  authorizeRoles("vendor", "admin"),
  updateStoreValidator,
  updateStore,
);
storeRouter.patch(
  "/:id/review",
  isAuthenticated,
  requireAdmin,
  requirePermission("stores.view"),
  reviewStoreValidator,
  reviewStore,
);

export default storeRouter;
