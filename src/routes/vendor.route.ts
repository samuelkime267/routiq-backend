import { Router } from "express";
import {
  createVendorNote,
  getVendor,
  listVendorNotes,
  listVendorOrders,
  listVendorProducts,
  listVendors,
  listVendorTransactions,
  listVendorVerification,
  updateVendorStatus,
} from "@/controllers/vendor";
import { isAuthenticated, requireAdmin, requirePermission } from "@/middleware";
import {
  createVendorNoteValidator,
  vendorStatusValidator,
} from "@/validators/vendor.validator";

const vendorRouter = Router();

vendorRouter.use(isAuthenticated, requireAdmin);

vendorRouter.get("/", requirePermission("vendors.view"), listVendors);
vendorRouter.get("/:vendorId", requirePermission("vendors.view"), getVendor);
vendorRouter.get(
  "/:vendorId/products",
  requirePermission("vendors.view"),
  listVendorProducts,
);
vendorRouter.get(
  "/:vendorId/orders",
  requirePermission("vendors.view"),
  listVendorOrders,
);
vendorRouter.get(
  "/:vendorId/transactions",
  requirePermission("vendors.view"),
  listVendorTransactions,
);
vendorRouter.get(
  "/:vendorId/verification",
  requirePermission("vendors.view"),
  listVendorVerification,
);
vendorRouter.get(
  "/:vendorId/notes",
  requirePermission("vendors.view"),
  listVendorNotes,
);
vendorRouter.post(
  "/:vendorId/notes",
  requirePermission("vendors.manage"),
  createVendorNoteValidator,
  createVendorNote,
);
vendorRouter.patch(
  "/:vendorId/status",
  requirePermission("vendors.manage"),
  vendorStatusValidator,
  updateVendorStatus,
);

export default vendorRouter;
