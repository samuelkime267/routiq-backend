import { Router } from "express";
import {
  createVendorBankAccountController,
  deleteVendorBankAccountController,
  getVendorDashboardController,
  getVendorFinanceController,
  getVendorSettingsController,
  listVendorBankAccountsController,
  setDefaultVendorBankAccountController,
  updateVendorBankAccountController,
  updateVendorSettingsController,
} from "@/controllers/vendorPortal";
import { authorizeRoles, isAuthenticated } from "@/middleware";
import {
  createBankAccountValidator,
  updateBankAccountValidator,
  updateVendorSettingsValidator,
} from "@/validators/vendorPortal.validator";

/**
 * Vendor self-service routes. Mounted at `/api/v1/vendors/me`, so the admin
 * vendor directory at `/api/v1/vendors` is never shadowed by these guards.
 */
const vendorPortalRouter = Router();

vendorPortalRouter.use(isAuthenticated, authorizeRoles("vendor"));

vendorPortalRouter.get("/", getVendorSettingsController);
vendorPortalRouter.get("/dashboard", getVendorDashboardController);
vendorPortalRouter.get("/finance", getVendorFinanceController);
vendorPortalRouter.get("/settings", getVendorSettingsController);
vendorPortalRouter.patch(
  "/settings",
  updateVendorSettingsValidator,
  updateVendorSettingsController,
);

vendorPortalRouter.get("/bank-accounts", listVendorBankAccountsController);
vendorPortalRouter.post(
  "/bank-accounts",
  createBankAccountValidator,
  createVendorBankAccountController,
);
vendorPortalRouter.patch(
  "/bank-accounts/:accountId",
  updateBankAccountValidator,
  updateVendorBankAccountController,
);
vendorPortalRouter.post(
  "/bank-accounts/:accountId/default",
  setDefaultVendorBankAccountController,
);
vendorPortalRouter.delete(
  "/bank-accounts/:accountId",
  deleteVendorBankAccountController,
);

export default vendorPortalRouter;
