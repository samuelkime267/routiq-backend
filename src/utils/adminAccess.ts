import type { CustomError } from "@/types";
import {
  type AdminRole,
  type AdminStatus,
  type Permission,
  hasEveryPermission,
} from "@/config/permissions";
import type { UserStatus } from "@/models/user.model";
import { createError } from "@/utils/createError";

/**
 * The small slice of a user document needed for administrative authorization.
 * Keeping this structural makes the guards easy to unit test without Mongo.
 */
export interface AdminSubject {
  _id?: unknown;
  role?: string | null;
  status?: UserStatus | string | null;
  adminRole?: AdminRole | null;
  adminStatus?: AdminStatus | null;
  permissionGrants?: Permission[] | null;
  permissionRevocations?: Permission[] | null;
}

const adminStatusMessage = (status: AdminStatus | null | undefined) => {
  switch (status) {
    case "INVITED":
      return "Your admin invitation has not been accepted yet";
    case "SUSPENDED":
      return "Your admin account has been suspended";
    case "DEACTIVATED":
      return "Your admin account has been deactivated";
    default:
      return "Admin access required";
  }
};

/**
 * Confirms the requester is an authenticated, active administrator.
 * Reused by every admin middleware and controller so the checks cannot drift.
 */
export const assertActiveAdmin = <T extends AdminSubject | undefined | null>(
  user: T,
): NonNullable<T> => {
  if (!user) {
    throw createError("User not authenticated", 401);
  }

  if (user.role !== "admin" || !user.adminRole) {
    throw createError("Admin access required", 403);
  }

  if (user.adminStatus !== "ACTIVE") {
    throw createError(adminStatusMessage(user.adminStatus), 403);
  }

  if (user.status && user.status !== "active") {
    throw createError("Account is not active", 403);
  }

  return user;
};

export const isActiveAdmin = (
  user: AdminSubject | undefined | null,
): boolean => {
  try {
    assertActiveAdmin(user);
    return true;
  } catch {
    return false;
  }
};

/**
 * Login is a special case: an INVITED admin has no password yet, so the
 * controller needs a distinct message before comparing credentials.
 */
export const assertAdminLoginAllowed = (user: AdminSubject) => {
  if (user.role !== "admin" || !user.adminRole) {
    throw createError("Invalid email or password", 401);
  }

  if (user.adminStatus !== "ACTIVE") {
    throw createError(adminStatusMessage(user.adminStatus), 403);
  }

  if (user.status && user.status !== "active") {
    throw createError("Account is not active", 403);
  }
};

export const assertPermission = (
  user: AdminSubject | undefined | null,
  permissions: readonly Permission[],
) => {
  const admin = assertActiveAdmin(user);

  if (!hasEveryPermission(admin, permissions)) {
    throw createError(
      "You do not have permission to perform this action",
      403,
    );
  }

  return admin;
};

const sameId = (left: AdminSubject, right: AdminSubject) =>
  left._id !== undefined &&
  right._id !== undefined &&
  String(left._id) === String(right._id);

/**
 * Only a Super Admin may hand out the SUPER_ADMIN role. This guard runs after
 * the `roles.manage` permission check, so a grant of `roles.manage` alone can
 * never be used to escalate to full platform access.
 */
export const assertCanAssignAdminRole = (
  actor: AdminSubject,
  nextRole: AdminRole,
) => {
  assertPermission(actor, ["roles.manage"]);

  if (nextRole === "SUPER_ADMIN" && actor.adminRole !== "SUPER_ADMIN") {
    throw createError("Only a Super Admin can assign the SUPER_ADMIN role", 403);
  }
};

export const assertCanInviteAdmin = (
  actor: AdminSubject,
  invitedRole: AdminRole,
) => {
  assertPermission(actor, ["admins.invite"]);

  if (invitedRole === "SUPER_ADMIN" && actor.adminRole !== "SUPER_ADMIN") {
    throw createError(
      "Only a Super Admin can invite another Super Admin",
      403,
    );
  }
};

export const assertCanManageAdmin = (
  actor: AdminSubject,
  target: AdminSubject,
) => {
  assertPermission(actor, ["admins.manage"]);

  if (sameId(actor, target)) {
    throw createError("You cannot change your own admin account", 400);
  }

  if (target.adminRole === "SUPER_ADMIN" && actor.adminRole !== "SUPER_ADMIN") {
    throw createError("Only a Super Admin can manage a Super Admin", 403);
  }
};

/**
 * Prevents the last active Super Admin from being suspended, deactivated or
 * demoted, which would lock everyone out of role management.
 */
export const assertCanChangeAdminStatus = (
  actor: AdminSubject,
  target: AdminSubject,
  nextStatus: AdminStatus,
  remainingActiveSuperAdmins = Number.POSITIVE_INFINITY,
) => {
  assertCanManageAdmin(actor, target);

  if (
    target.adminRole === "SUPER_ADMIN" &&
    target.adminStatus === "ACTIVE" &&
    nextStatus !== "ACTIVE" &&
    remainingActiveSuperAdmins <= 1
  ) {
    throw createError("At least one active Super Admin is required", 400);
  }
};

export const assertCanModifyPermissions = (
  actor: AdminSubject,
  target: AdminSubject,
) => {
  assertPermission(actor, ["roles.manage"]);

  if (actor.adminRole !== "SUPER_ADMIN") {
    throw createError("Only a Super Admin can change admin permissions", 403);
  }

  if (sameId(actor, target)) {
    throw createError("You cannot modify your own permissions", 400);
  }
};

/**
 * Keeps the legacy `status` field in step with the admin lifecycle so the
 * shared `isAuthenticated` / refresh-token middleware rejects inactive admins.
 */
export const syncAdminStatusFields = (
  adminStatus: AdminStatus,
): { adminStatus: AdminStatus; status: UserStatus } => {
  const status: UserStatus =
    adminStatus === "ACTIVE"
      ? "active"
      : adminStatus === "SUSPENDED"
        ? "suspended"
        : "inactive";

  return { adminStatus, status };
};

export const asCustomError = (error: unknown): CustomError =>
  error as CustomError;
