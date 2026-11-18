import { Router } from "express";
import {
  cancelVendorWithdrawalController,
  createWithdrawalController,
  decideAdminWithdrawalController,
  getAdminWithdrawalController,
  getVendorWithdrawalController,
  listAdminBankAccountsController,
  listAdminWithdrawalsController,
  listVendorWithdrawalsController,
  verifyAdminBankAccountController,
} from "@/controllers/vendorPortal";
import {
  authorizeRoles,
  isAuthenticated,
  requireAdmin,
  requirePermission,
} from "@/middleware";
import {
  adminWithdrawalDecisionValidator,
  cancelWithdrawalValidator,
  createWithdrawalValidator,
  verifyBankAccountValidator,
} from "@/validators/vendorPortal.validator";

const withdrawalRouter = Router();

/* -------------------------------------------------------------------------- */
/* Vendor                                                                     */
/* -------------------------------------------------------------------------- */

withdrawalRouter.get(
  "/vendor",
  isAuthenticated,
  authorizeRoles("vendor"),
  listVendorWithdrawalsController,
);
withdrawalRouter.post(
  "/vendor",
  isAuthenticated,
  authorizeRoles("vendor"),
  createWithdrawalValidator,
  createWithdrawalController,
);
withdrawalRouter.get(
  "/vendor/:withdrawalId",
  isAuthenticated,
  authorizeRoles("vendor"),
  getVendorWithdrawalController,
);
withdrawalRouter.post(
  "/vendor/:withdrawalId/cancel",
  isAuthenticated,
  authorizeRoles("vendor"),
  cancelWithdrawalValidator,
  cancelVendorWithdrawalController,
);

/* -------------------------------------------------------------------------- */
/* Administration                                                             */
/* -------------------------------------------------------------------------- */

// Static admin paths are declared before `/:withdrawalId` so `bank-accounts`
// is never interpreted as an id.
withdrawalRouter.get(
  "/admin/bank-accounts",
  isAuthenticated,
  requireAdmin,
  requirePermission("withdrawals.view"),
  listAdminBankAccountsController,
);
withdrawalRouter.post(
  "/admin/bank-accounts/:accountId/verify",
  isAuthenticated,
  requireAdmin,
  requirePermission("withdrawals.manage"),
  verifyBankAccountValidator,
  verifyAdminBankAccountController,
);

withdrawalRouter.get(
  "/admin",
  isAuthenticated,
  requireAdmin,
  requirePermission("withdrawals.view"),
  listAdminWithdrawalsController,
);
withdrawalRouter.get(
  "/admin/:withdrawalId",
  isAuthenticated,
  requireAdmin,
  requirePermission("withdrawals.view"),
  getAdminWithdrawalController,
);
withdrawalRouter.post(
  "/admin/:withdrawalId/decision",
  isAuthenticated,
  requireAdmin,
  requirePermission("withdrawals.manage"),
  adminWithdrawalDecisionValidator,
  decideAdminWithdrawalController,
);

export default withdrawalRouter;
