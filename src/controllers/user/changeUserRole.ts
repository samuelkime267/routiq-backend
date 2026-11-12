import type { NextFunction, Request, Response } from "express";
import User from "@/models/user.model";
import { ChangeUserRoleSchemaType } from "@/schemas/user";
import { assertActiveAdmin } from "@/utils/adminAccess";
import { auditActorFromUser, recordAudit, requestMetadata } from "@/lib/audit";
import { createError } from "@/utils";

export const changeUserRole = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const admin = assertActiveAdmin(req.user);

    if (admin._id.toString() === req.params.id) {
      throw createError("You cannot change your own role", 400);
    }

    const user = await User.findById(req.params.id);
    if (!user) throw createError("User not found", 404);

    const { role } = req.body as ChangeUserRoleSchemaType;
    const previousRole = user.role;

    if (role === "admin") {
      throw createError(
        "Use the admin invitation flow to grant administrative access",
        400,
      );
    }

    if (user.role === "admin") {
      if (admin.adminRole !== "SUPER_ADMIN") {
        throw createError(
          "Only a Super Admin can remove administrative access",
          403,
        );
      }

      // Removing admin access must also clear administrative state so a later
      // promotion cannot inherit stale role, status or permission overrides.
      user.adminRole = null;
      user.adminStatus = null;
      user.permissionGrants = [];
      user.permissionRevocations = [];
    }

    user.role = role;
    await user.save();

    await recordAudit({
      actor: auditActorFromUser(admin),
      action: "user.role_changed",
      entityType: "user",
      entityId: user._id,
      entityLabel: user.name,
      previousState: { role: previousRole },
      newState: { role },
      request: requestMetadata(req),
    });

    res.status(200).json({
      message: "User role updated successfully",
      success: true,
      data: { user },
    });
  } catch (error) {
    next(error);
  }
};
