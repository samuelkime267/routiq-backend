import { Router } from "express";
import {
  adminInvitationDetail,
  adminInvitationList,
  adminInvitationResend,
  adminInvitationRevoke,
  adminInvite,
  adminList,
  adminUpdatePermissions,
  adminUpdateRole,
  adminUpdateStatus,
  getAdmin,
  getAdminProfile,
  updateAdminProfile,
} from "@/controllers/admin";
import {
  dashboardCharts,
  dashboardMetrics,
  dashboardOverview,
  dashboardPendingActions,
  dashboardRecentActivity,
} from "@/controllers/dashboard";
import {
  adminInvitationActionValidator,
  adminInviteValidator,
  adminPermissionsValidator,
  adminProfileValidator,
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

// Own profile (declared before `/:id`).
adminRouter.get("/admins/me", getAdminProfile);
adminRouter.patch("/admins/me", adminProfileValidator, updateAdminProfile);

adminRouter.get("/admins", requirePermission("admins.view"), adminList);

// Legacy invite alias kept for the existing console, plus the versioned
// invitation resource used by the new screens.
adminRouter.post(
  "/admins/invite",
  requirePermission("admins.invite"),
  adminInviteValidator,
  adminInvite,
);
adminRouter.get(
  "/admins/invitations",
  requirePermission("admins.view"),
  adminInvitationList,
);
adminRouter.post(
  "/admins/invitations",
  requirePermission("admins.invite"),
  adminInviteValidator,
  adminInvite,
);
adminRouter.get(
  "/admins/invitations/:invitationId",
  requirePermission("admins.view"),
  adminInvitationDetail,
);
adminRouter.post(
  "/admins/invitations/:invitationId/resend",
  requirePermission("admins.invite"),
  adminInvitationResend,
);
adminRouter.post(
  "/admins/invitations/:invitationId/revoke",
  requirePermission("admins.manage"),
  adminInvitationActionValidator,
  adminInvitationRevoke,
);

adminRouter.get("/admins/:id", requirePermission("admins.view"), getAdmin);
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
