import { Router } from "express";
import {
  getTransaction,
  listTransactions,
} from "@/controllers/transaction";
import { listVendorTransactionsController } from "@/controllers/vendorPortal";
import {
  authorizeRoles,
  isAuthenticated,
  requireAdmin,
  requirePermission,
} from "@/middleware";

const transactionRouter = Router();

// Vendor ledger must be declared before the admin guard below, which applies to
// every other path in this router.
transactionRouter.get(
  "/vendor",
  isAuthenticated,
  authorizeRoles("vendor"),
  listVendorTransactionsController,
);

transactionRouter.use(isAuthenticated, requireAdmin);

transactionRouter.get(
  "/",
  requirePermission("transactions.view"),
  listTransactions,
);
transactionRouter.get(
  "/:transactionId",
  requirePermission("transactions.view"),
  getTransaction,
);

export default transactionRouter;
