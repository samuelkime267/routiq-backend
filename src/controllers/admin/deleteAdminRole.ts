import type { NextFunction, Request, Response } from "express";
import { auditActorFromUser, recordAudit, requestMetadata } from "@/lib/audit";
import { PERMISSIONS, type Permission } from "@/config/permissions";
import User from "@/models/user.model";
import { findRoleDefinition, reloadAdminRoleRegistry } from "@/services/adminRoles";
import { assertCanGrantPermissions } from "@/utils/adminAccess";
import { createError } from "@/utils";

/**
 * Deletes a custom role. Built-in roles are permanent, and a role that is still
 * assigned to an administrator must be reassigned first so no account is left
 * without a resolvable permission set.
 */
export const deleteAdminRole = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const actor = req.user!;
    const { roleId } = req.params;
    const reason =
      typeof req.body?.reason === "string" ? req.body.reason.trim() : "";

    if (typeof roleId !== "string") {
      throw createError("Role not found", 404);
    }

    const role = await findRoleDefinition(roleId);
    if (!role) throw createError("Role not found", 404);

    if (role.system) {
      throw createError("Built-in roles cannot be deleted", 403);
    }

    const permissions = role.permissions.filter(
      (permission): permission is Permission =>
        PERMISSIONS.includes(permission as Permission),
    );

    assertCanGrantPermissions(actor, permissions);

    const assigned = await User.countDocuments({
      role: "admin",
      adminRole: role.key,
    });

    if (assigned > 0) {
      throw createError(
        `Reassign the ${assigned} administrator${assigned === 1 ? "" : "s"} using this role before deleting it`,
        400,
      );
    }

    const previousState = {
      key: role.key,
      label: role.label,
      description: role.description,
      permissions: [...role.permissions],
    };

    await role.deleteOne();
    await reloadAdminRoleRegistry();

    await recordAudit({
      actor: auditActorFromUser(actor),
      action: "admin_role.deleted",
      entityType: "admin_role",
      entityId: role._id,
      entityLabel: role.label,
      previousState,
      newState: null,
      reason: reason || null,
      request: requestMetadata(req),
    });

    res.status(200).json({
      message: "Admin role deleted successfully",
      success: true,
      data: { deleted: true, key: role.key },
    });
  } catch (error) {
    next(error);
  }
};
