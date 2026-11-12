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
import { isAuthenticated, requireAdmin, requirePermission } from "@/middleware";
import {
  adminInvitationActionValidator,
  adminInviteValidator,
  adminPermissionsValidator,
  adminProfileValidator,
  adminRoleValidator,
  adminStatusValidator,
} from "@/validators/admin.validator";

const adminsRouter = Router();

adminsRouter.use(isAuthenticated, requireAdmin);

// Own profile: available to every active administrator.
adminsRouter.get("/me", getAdminProfile);
adminsRouter.patch("/me", adminProfileValidator, updateAdminProfile);

adminsRouter.get("/", requirePermission("admins.view"), adminList);

// Invitations are declared before `/:adminId` so the literal path wins.
adminsRouter.get(
  "/invitations",
  requirePermission("admins.view"),
  adminInvitationList,
);
adminsRouter.post(
  "/invitations",
  requirePermission("admins.invite"),
  adminInviteValidator,
  adminInvite,
);
adminsRouter.get(
  "/invitations/:invitationId",
  requirePermission("admins.view"),
  adminInvitationDetail,
);
adminsRouter.post(
  "/invitations/:invitationId/resend",
  requirePermission("admins.invite"),
  adminInvitationResend,
);
adminsRouter.post(
  "/invitations/:invitationId/revoke",
  requirePermission("admins.manage"),
  adminInvitationActionValidator,
  adminInvitationRevoke,
);

adminsRouter.get("/:adminId", requirePermission("admins.view"), getAdmin);
adminsRouter.patch(
  "/:adminId/role",
  requirePermission("roles.manage"),
  adminRoleValidator,
  adminUpdateRole,
);
adminsRouter.patch(
  "/:adminId/status",
  requirePermission("admins.manage"),
  adminStatusValidator,
  adminUpdateStatus,
);
adminsRouter.patch(
  "/:adminId/permissions",
  requirePermission("roles.manage"),
  adminPermissionsValidator,
  adminUpdatePermissions,
);

export default adminsRouter;
