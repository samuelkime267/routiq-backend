import type { NextFunction, Request, Response } from "express";
import { permissionsForAdmin } from "@/config/permissions";
import { actorFromUser, recordActivity } from "@/lib/activity";
import { auditActorFromUser, recordAudit, requestMetadata } from "@/lib/audit";
import User from "@/models/user.model";
import type { AdminRoleSchemaType } from "@/schemas/admin";
import {
  assertCanAssignAdminRole,
  assertCanManageAdmin,
} from "@/utils/adminAccess";
import { createError } from "@/utils/createError";

const findAdmin = async (id: string) => {
  const admin = await User.findById(id);

  if (!admin || admin.role !== "admin" || !admin.adminRole) {
    throw createError("Admin not found", 404);
  }

  return admin;
};

const activeSuperAdminCount = () =>
  User.countDocuments({
    role: "admin",
    adminRole: "SUPER_ADMIN",
    adminStatus: "ACTIVE",
  });

export const adminUpdateRole = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const actor = req.user!;
    const { adminRole, reason } = req.body as AdminRoleSchemaType;
    const target = await findAdmin(
      String(req.params.adminId ?? req.params.id),
    );

    assertCanAssignAdminRole(actor, adminRole);
    assertCanManageAdmin(actor, target);

    if (
      target.adminRole === "SUPER_ADMIN" &&
      adminRole !== "SUPER_ADMIN" &&
      (await activeSuperAdminCount()) <= 1
    ) {
      throw createError("At least one active Super Admin is required", 400);
    }

    const previousRole = target.adminRole;

    target.adminRole = adminRole;

    // Role changes reset per-admin overrides so stale grants cannot carry a
    // privilege from the previous role into the new one.
    target.permissionGrants = [];
    target.permissionRevocations = [];

    await target.save();

    await recordActivity({
      type: "admin_action",
      channel: "administration",
      title: "Administrator role updated",
      description: `${actor.name} set ${target.name}'s role to ${adminRole
        .toLowerCase()
        .replace(/_/g, " ")}.`,
      actor: actorFromUser(actor),
      subject: { type: "admin", id: target._id, label: target.name },
      href: `/admins?search=${encodeURIComponent(target.email)}`,
      metadata: { adminRole },
    });

    await recordAudit({
      actor: auditActorFromUser(actor),
      action: "admin.role_changed",
      entityType: "admin",
      entityId: target._id,
      entityLabel: target.name,
      previousState: { adminRole: previousRole },
      newState: { adminRole },
      reason: reason ?? null,
      request: requestMetadata(req),
    });

    res.status(200).json({
      message: "Admin role updated successfully",
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
