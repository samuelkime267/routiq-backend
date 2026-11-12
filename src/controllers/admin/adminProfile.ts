import type { NextFunction, Request, Response } from "express";
import { permissionsForAdmin } from "@/config/permissions";
import { auditActorFromUser, recordAudit, requestMetadata } from "@/lib/audit";
import type { UserDocument } from "@/models/user.model";
import type { UpdateAdminProfileSchemaType } from "@/schemas/admin";
import { assertActiveAdmin } from "@/utils/adminAccess";
import { createError } from "@/utils";

export const getAdminProfile = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const admin = assertActiveAdmin(req.user as UserDocument);

    res.status(200).json({
      message: "Admin profile retrieved successfully",
      success: true,
      data: {
        user: admin,
        permissions: permissionsForAdmin(admin),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Updates the signed-in administrator's own profile. Role, status and
 * permissions are deliberately not editable here; those are guarded by the
 * account-management endpoints.
 */
export const updateAdminProfile = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const admin = assertActiveAdmin(req.user as UserDocument);
    const { name, phone, profilePicture, reason } =
      req.body as UpdateAdminProfileSchemaType;

    if (!admin) throw createError("User not authenticated", 401);

    const previousState = {
      name: admin.name,
      phone: admin.phone ?? null,
      profilePicture: admin.profilePicture ?? null,
    };

    if (name !== undefined) admin.name = name;
    if (phone !== undefined) admin.phone = phone;
    if (profilePicture !== undefined) admin.profilePicture = profilePicture;

    await admin.save();

    await recordAudit({
      actor: auditActorFromUser(admin),
      action: "admin.profile_updated",
      entityType: "admin",
      entityId: admin._id,
      entityLabel: admin.name,
      previousState,
      newState: {
        name: admin.name,
        phone: admin.phone ?? null,
        profilePicture: admin.profilePicture ?? null,
      },
      reason: reason ?? null,
      request: requestMetadata(req),
    });

    res.status(200).json({
      message: "Admin profile updated successfully",
      success: true,
      data: {
        user: admin,
        permissions: permissionsForAdmin(admin),
      },
    });
  } catch (error) {
    next(error);
  }
};
