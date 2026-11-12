import bcrypt from "bcryptjs";
import type { NextFunction, Request, Response } from "express";
import { permissionsForAdmin } from "@/config/permissions";
import { actorFromUser, recordActivity } from "@/lib/activity";
import { auditActorFromUser, recordAudit, requestMetadata } from "@/lib/audit";
import AdminInvitation from "@/models/adminInvitation.model";
import User from "@/models/user.model";
import type { AcceptAdminInvitationSchemaType } from "@/schemas/admin";
import { syncAdminStatusFields } from "@/utils/adminAccess";
import { createError } from "@/utils/createError";
import { generateJwtToken, hashKey } from "@/utils";
import { refreshTokenCookieOptions } from "@/utils/refreshCookie";

/**
 * Public, unauthenticated acceptance of an administrative invitation.
 *
 * The token is single-use: the invitation moves to ACCEPTED inside the same
 * flow, and every other pending invitation for the account is revoked. The
 * response mirrors the admin login payload so the console can sign the new
 * administrator in immediately.
 */
export const adminAcceptInvitation = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { token, password } = req.body as AcceptAdminInvitationSchemaType;
    const now = new Date();

    const invitation = await AdminInvitation.findOne({
      tokenHash: hashKey(token),
      status: "PENDING",
    }).select("+tokenHash");

    if (!invitation) {
      throw createError(
        "This invitation link is invalid or has already been used",
        400,
      );
    }

    if (new Date(invitation.expiresAt).getTime() <= now.getTime()) {
      invitation.status = "EXPIRED";
      await invitation.save();

      throw createError(
        "This invitation has expired. Ask an administrator to resend it.",
        400,
      );
    }

    const admin = await User.findById(invitation.admin).select("+password");

    if (!admin || admin.role !== "admin") {
      throw createError("The invited administrator account no longer exists", 404);
    }

    if (admin.adminStatus === "SUSPENDED") {
      throw createError("This admin account is suspended", 403);
    }

    if (admin.adminStatus === "DEACTIVATED") {
      throw createError(
        "This invitation was revoked. Ask an administrator for a new invitation.",
        403,
      );
    }

    admin.password = await bcrypt.hash(password, 10);
    admin.authProvider = "local";
    admin.adminRole = invitation.adminRole;
    admin.isEmailVerified = true;
    admin.passwordResetToken = null;
    admin.passwordResetTokenExpiryDate = null;
    admin.lastLoginAt = now;
    Object.assign(admin, syncAdminStatusFields("ACTIVE"));
    await admin.save();

    invitation.status = "ACCEPTED";
    invitation.acceptedAt = now;
    await invitation.save();

    await AdminInvitation.updateMany(
      {
        admin: admin._id,
        status: "PENDING",
        _id: { $ne: invitation._id },
      },
      {
        $set: {
          status: "REVOKED",
          revokedAt: now,
          revokedBy: admin._id,
        },
      },
    );

    await recordActivity({
      type: "admin_action",
      channel: "administration",
      title: "Admin invitation accepted",
      description: `${admin.name} activated their admin account.`,
      actor: actorFromUser(admin),
      subject: { type: "admin", id: admin._id, label: admin.name },
      href: `/admins/${String(admin._id)}`,
      metadata: {
        invitationId: String(invitation._id),
        adminRole: invitation.adminRole,
      },
    });

    await recordAudit({
      actor: auditActorFromUser(admin),
      action: "admin.invitation_accepted",
      entityType: "invitation",
      entityId: invitation._id,
      entityLabel: admin.email,
      previousState: { status: "PENDING" },
      newState: {
        status: "ACCEPTED",
        acceptedAt: now.toISOString(),
        adminRole: invitation.adminRole,
      },
      metadata: { adminId: String(admin._id) },
      request: requestMetadata(req),
    });

    const jwt = generateJwtToken(admin._id);

    res
      .cookie("refreshToken", jwt.refreshToken, refreshTokenCookieOptions)
      .status(200)
      .json({
        message: "Admin invitation accepted successfully",
        success: true,
        data: {
          user: admin,
          token: jwt,
          permissions: permissionsForAdmin(admin),
        },
      });
  } catch (error) {
    next(error);
  }
};
