import type { NextFunction, Request, Response } from "express";
import { permissionsForAdmin } from "@/config/permissions";
import { actorFromUser, recordActivity } from "@/lib/activity";
import User from "@/models/user.model";
import type { AdminStatusSchemaType } from "@/schemas/admin";
import {
  assertCanChangeAdminStatus,
  syncAdminStatusFields,
} from "@/utils/adminAccess";
import { createError } from "@/utils/createError";

export const adminUpdateStatus = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const actor = req.user!;
    const { adminStatus } = req.body as AdminStatusSchemaType;
    const target = await User.findById(req.params.id);

    if (!target || target.role !== "admin" || !target.adminRole) {
      throw createError("Admin not found", 404);
    }

    const activeSuperAdmins = await User.countDocuments({
      role: "admin",
      adminRole: "SUPER_ADMIN",
      adminStatus: "ACTIVE",
    });

    assertCanChangeAdminStatus(actor, target, adminStatus, activeSuperAdmins);

    Object.assign(target, syncAdminStatusFields(adminStatus));
    await target.save();

    const statusLabel =
      adminStatus === "ACTIVE"
        ? "reactivated"
        : adminStatus.toLowerCase();

    await recordActivity({
      type: "admin_action",
      channel: "administration",
      title: `Administrator ${statusLabel}`,
      description: `${actor.name} changed ${target.name}'s status to ${adminStatus}.`,
      actor: actorFromUser(actor),
      subject: { type: "admin", id: target._id, label: target.name },
      href: `/admins?search=${encodeURIComponent(target.email)}`,
      metadata: { adminStatus },
    });

    res.status(200).json({
      message: "Admin status updated successfully",
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
