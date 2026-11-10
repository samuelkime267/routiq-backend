import { Router } from "express";
import {
  financialOverview,
  financialReconciliation,
  financialRevenue,
} from "@/controllers/financial";
import {
  isAuthenticated,
  requireAdmin,
  requirePermission,
} from "@/middleware";

const financialRouter = Router();

financialRouter.use(isAuthenticated, requireAdmin);

financialRouter.get(
  "/admin/overview",
  requirePermission("financials.view"),
  financialOverview,
);
financialRouter.get(
  "/admin/revenue",
  requirePermission("financials.view"),
  financialRevenue,
);
financialRouter.get(
  "/admin/reconciliation",
  requirePermission("financials.view"),
  financialReconciliation,
);

export default financialRouter;
