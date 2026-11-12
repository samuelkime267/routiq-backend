import type { NextFunction, Request, Response } from "express";
import { auditActorFromUser, recordAudit, requestMetadata } from "@/lib/audit";
import AdminRoleDefinition from "@/models/adminRoleDefinition.model";
import type { CreateAdminRoleSchemaType } from "@/schemas/adminRole";
import { reloadAdminRoleRegistry } from "@/services/adminRoles";
import { assertCanGrantPermissions } from "@/utils/adminAccess";
import { createError } from "@/utils";

export const createAdminRole = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const actor = req.user!;
    const { key, label, description, permissions, reason } =
      req.body as CreateAdminRoleSchemaType;

    // Permission check plus privilege-escalation guard: a role can never grant
    // more than its creator holds.
    assertCanGrantPermissions(actor, permissions);

    const existing = await AdminRoleDefinition.findOne({ key });
    if (existing) {
      throw createError("A role with this key already exists", 400);
    }

    const role = await AdminRoleDefinition.create({
      key,
      label,
      description: description ?? "",
      permissions: [...new Set(permissions)],
      system: false,
      createdBy: actor._id,
      updatedBy: actor._id,
    });

    await reloadAdminRoleRegistry();

    await recordAudit({
      actor: auditActorFromUser(actor),
      action: "admin_role.created",
      entityType: "admin_role",
      entityId: role._id,
      entityLabel: role.label,
      previousState: null,
      newState: {
        key: role.key,
        label: role.label,
        description: role.description,
        permissions: role.permissions,
      },
      reason: reason ?? null,
      request: requestMetadata(req),
    });

    res.status(201).json({
      message: "Admin role created successfully",
      success: true,
      data: { role },
    });
  } catch (error) {
    next(error);
  }
};
