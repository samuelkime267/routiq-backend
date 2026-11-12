import type { NextFunction, Request, Response } from "express";
import { permissionsForAdmin } from "@/config/permissions";
import { actorFromUser, recordActivity } from "@/lib/activity";
import { auditActorFromUser, recordAudit, requestMetadata } from "@/lib/audit";
import User from "@/models/user.model";
import type { AdminPermissionsSchemaType } from "@/schemas/admin";
import { assertCanModifyPermissions } from "@/utils/adminAccess";
import { createError } from "@/utils/createError";

export const adminUpdatePermissions = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const actor = req.user!;
    const { grants, revocations, reason } = req.body as AdminPermissionsSchemaType;
    const target = await User.findById(
      req.params.adminId ?? req.params.id,
    );

    if (!target || target.role !== "admin" || !target.adminRole) {
      throw createError("Admin not found", 404);
    }

    assertCanModifyPermissions(actor, target);

    const previousGrants = [...(target.permissionGrants ?? [])];
    const previousRevocations = [...(target.permissionRevocations ?? [])];

    const revoked = [...new Set(revocations)];
    const granted = [...new Set(grants)].filter(
      (permission) => !revoked.includes(permission),
    );

    target.permissionGrants = granted;
    target.permissionRevocations = revoked;
    await target.save();

    await recordActivity({
      type: "admin_action",
      channel: "administration",
      title: "Administrator permissions updated",
      description: `${actor.name} updated ${target.name}'s permission overrides (${granted.length} granted, ${revoked.length} revoked).`,
      actor: actorFromUser(actor),
      subject: { type: "admin", id: target._id, label: target.name },
      href: `/admins?search=${encodeURIComponent(target.email)}`,
      metadata: { grants: granted, revocations: revoked },
    });

    await recordAudit({
      actor: auditActorFromUser(actor),
      action: "admin.permissions_changed",
      entityType: "admin",
      entityId: target._id,
      entityLabel: target.name,
      previousState: {
        grants: previousGrants,
        revocations: previousRevocations,
      },
      newState: { grants: granted, revocations: revoked },
      reason: reason ?? null,
      request: requestMetadata(req),
    });

    res.status(200).json({
      message: "Admin permissions updated successfully",
      success: true,
      data: {
        admin: target,
        permissions: permissionsForAdmin(target),
      },
    });
  } catch (error) {
    next(error);
  }
};
