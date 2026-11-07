import { Router } from "express";
import {
  adminInvite,
  adminList,
  adminUpdatePermissions,
  adminUpdateRole,
  adminUpdateStatus,
} from "@/controllers/admin";
import {
  dashboardCharts,
  dashboardMetrics,
  dashboardOverview,
  dashboardPendingActions,
  dashboardRecentActivity,
} from "@/controllers/dashboard";
import {
  adminInviteValidator,
  adminPermissionsValidator,
  adminRoleValidator,
  adminStatusValidator,
} from "@/validators/admin.validator";
import { isAuthenticated, requireAdmin, requirePermission } from "@/middleware";

const adminRouter = Router();

// Every administrative resource requires a live, active admin session. The
// permission check is applied per route so new endpoints must opt in
// explicitly instead of inheriting broad access.
adminRouter.use(isAuthenticated, requireAdmin);

// Dashboard aggregates. Each endpoint is permission-gated; the overview is the
// single bootstrap call used by the console and composes the other four.
adminRouter.get(
  "/dashboard/overview",
  requirePermission("dashboard.view"),
  dashboardOverview,
);
adminRouter.get(
  "/dashboard/metrics",
  requirePermission("dashboard.view"),
  dashboardMetrics,
);
adminRouter.get(
  "/dashboard/charts",
  requirePermission("dashboard.view"),
  dashboardCharts,
);
adminRouter.get(
  "/dashboard/pending-actions",
  requirePermission("dashboard.view"),
  dashboardPendingActions,
);
adminRouter.get(
  "/dashboard/recent-activity",
  requirePermission("dashboard.view"),
  dashboardRecentActivity,
);

adminRouter.get("/admins", requirePermission("admins.view"), adminList);
adminRouter.post(
  "/admins/invite",
  requirePermission("admins.invite"),
  adminInviteValidator,
  adminInvite,
);
adminRouter.patch(
  "/admins/:id/role",
  requirePermission("roles.manage"),
  adminRoleValidator,
  adminUpdateRole,
);
adminRouter.patch(
  "/admins/:id/status",
  requirePermission("admins.manage"),
  adminStatusValidator,
  adminUpdateStatus,
);
adminRouter.patch(
  "/admins/:id/permissions",
  requirePermission("roles.manage"),
  adminPermissionsValidator,
  adminUpdatePermissions,
);

export default adminRouter;
