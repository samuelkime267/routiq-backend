import bcrypt from "bcryptjs";
import type { NextFunction, Request, Response } from "express";
import { auditActorFromUser, recordAudit, requestMetadata } from "@/lib/audit";
import AdminInvitation from "@/models/adminInvitation.model";
import User from "@/models/user.model";
import type { UpdatePasswordSchemaType } from "@/schemas/auth";
import { createError } from "@/utils/createError";
import { hashKey } from "@/utils/hashKey";
import { syncAdminStatusFields } from "@/utils/adminAccess";

export const adminResetPassword = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { token } = req.params;
    const { password } = req.body as UpdatePasswordSchemaType;

    if (typeof token !== "string") {
      throw createError("Invalid token format", 400);
    }

    const user = await User.findOne({
      role: "admin",
      passwordResetToken: hashKey(token),
      passwordResetTokenExpiryDate: { $gt: Date.now() },
    });

    if (!user) {
      throw createError("Invalid or expired token", 400);
    }

    if (
      user.adminStatus === "SUSPENDED" ||
      user.adminStatus === "DEACTIVATED"
    ) {
      throw createError("This admin account is not active", 403);
    }

    user.password = await bcrypt.hash(password, 10);
    user.passwordResetToken = undefined;
    user.passwordResetTokenExpiryDate = undefined;
    user.otpAttempts = 0;
    user.isEmailVerified = true;

    const previousStatus = user.adminStatus;
    const acceptedInvitation = user.adminStatus === "INVITED";

    // Accepting an invitation activates the account. Active admins keep their
    // current lifecycle state when they reset a forgotten password.
    if (acceptedInvitation) {
      Object.assign(user, syncAdminStatusFields("ACTIVE"));
    }

    await user.save();

    if (acceptedInvitation) {
      await AdminInvitation.updateMany(
        { admin: user._id, status: "PENDING" },
        { $set: { status: "ACCEPTED", acceptedAt: new Date() } },
      );
    }

    await recordAudit({
      actor: auditActorFromUser(user),
      action: acceptedInvitation
        ? "admin.invitation_accepted"
        : "admin.password_reset",
      entityType: "admin",
      entityId: user._id,
      entityLabel: user.name,
      previousState: { adminStatus: previousStatus },
      newState: { adminStatus: user.adminStatus },
      metadata: { via: "reset_password" },
      request: requestMetadata(req),
    });

    res.status(200).json({
      message: "Password reset successfully",
      success: true,
    });
  } catch (error) {
    next(error);
  }
};
