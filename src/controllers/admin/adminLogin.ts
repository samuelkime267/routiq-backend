import bcrypt from "bcryptjs";
import type { NextFunction, Request, Response } from "express";
import { permissionsForAdmin } from "@/config/permissions";
import { auditActorFromUser, recordAudit, requestMetadata } from "@/lib/audit";
import User from "@/models/user.model";
import type { AdminLoginSchemaType } from "@/schemas/admin";
import { createError } from "@/utils/createError";
import {
  assertAdminLoginAllowed,
  syncAdminStatusFields,
} from "@/utils/adminAccess";
import { generateJwtToken, refreshTokenCookieOptions } from "@/utils";

export const adminLogin = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email, password } = req.body as AdminLoginSchemaType;
    const user = await User.findOne({
      email: email.toLowerCase(),
    }).select("+password");

    if (!user || user.role !== "admin" || !user.adminRole) {
      throw createError("Invalid email or password", 401);
    }

    if (!user.password || user.authProvider !== "local") {
      if (user.adminStatus === "INVITED") {
        throw createError(
          "Your admin invitation has not been accepted yet. Use the invitation link to set a password.",
          403,
        );
      }

      throw createError(
        `Admin sign-in is not available for ${user.authProvider} accounts`,
        400,
      );
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      throw createError("Invalid email or password", 401);
    }

    assertAdminLoginAllowed(user);

    // Keep the lifecycle fields consistent even for legacy admin records that
    // were created before administrative statuses existed.
    if (user.adminStatus !== "ACTIVE") {
      Object.assign(user, syncAdminStatusFields("ACTIVE"));
    }

    user.lastLoginAt = new Date();
    await user.save();

    await recordAudit({
      actor: auditActorFromUser(user),
      action: "admin.login",
      entityType: "admin",
      entityId: user._id,
      entityLabel: user.name,
      previousState: null,
      newState: { lastLoginAt: user.lastLoginAt.toISOString() },
      request: requestMetadata(req),
    });

    const token = generateJwtToken(user._id);

    res
      .cookie("refreshToken", token.refreshToken, refreshTokenCookieOptions)
      .status(200)
      .json({
        message: "Admin logged in successfully",
        success: true,
        data: {
          user,
          token,
          permissions: permissionsForAdmin(user),
        },
      });
  } catch (error) {
    next(error);
  }
};
