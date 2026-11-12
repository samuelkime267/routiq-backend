import type { NextFunction, Request, Response } from "express";
import { auditActorFromUser, recordAudit, requestMetadata } from "@/lib/audit";
import type { UpdateAdminRoleSchemaType } from "@/schemas/adminRole";
import {
  findRoleDefinition,
  reloadAdminRoleRegistry,
} from "@/services/adminRoles";
import { assertCanGrantPermissions } from "@/utils/adminAccess";
import { createError } from "@/utils";

export const updateAdminRole = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const actor = req.user!;
    const { roleId } = req.params;
    const { label, description, permissions, reason } =
      req.body as UpdateAdminRoleSchemaType;

    if (typeof roleId !== "string") {
      throw createError("Role not found", 404);
    }

    const role = await findRoleDefinition(roleId);
    if (!role) throw createError("Role not found", 404);

    if (role.key === "SUPER_ADMIN") {
      throw createError(
        "The Super Admin role always holds every permission and cannot be modified",
        403,
      );
    }

    const nextPermissions = permissions
      ? [...new Set(permissions)]
      : [...role.permissions];

    // Even editing description or label re-checks the resulting permission set
    // so a lower-privilege administrator cannot widen a role indirectly.
    assertCanGrantPermissions(actor, nextPermissions);

    const previousState = {
      label: role.label,
      description: role.description,
      permissions: [...role.permissions],
    };

    if (label !== undefined) role.label = label;
    if (description !== undefined) role.description = description;
    if (permissions !== undefined) role.permissions = nextPermissions;
    role.updatedBy = actor._id as never;

    await role.save();
    await reloadAdminRoleRegistry();

    await recordAudit({
      actor: auditActorFromUser(actor),
      action: "admin_role.updated",
      entityType: "admin_role",
      entityId: role._id,
      entityLabel: role.label,
      previousState,
      newState: {
        label: role.label,
        description: role.description,
        permissions: role.permissions,
      },
      reason: reason ?? null,
      request: requestMetadata(req),
    });

    res.status(200).json({
      message: "Admin role updated successfully",
      success: true,
      data: { role },
    });
  } catch (error) {
    next(error);
  }
};
