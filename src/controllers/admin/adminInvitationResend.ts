import type { NextFunction, Request, Response } from "express";
import { ADMIN_URL } from "@/config/env";
import { actorFromUser, recordActivity } from "@/lib/activity";
import { auditActorFromUser, recordAudit, requestMetadata } from "@/lib/audit";
import { sendMail } from "@/lib/mail/mailer";
import { adminInvitationTemplate } from "@/lib/mail/template";
import AdminInvitation from "@/models/adminInvitation.model";
import User from "@/models/user.model";
import { serialiseAdminInvitation } from "@/services/admins";
import { safePlatformSettings } from "@/services/settings";
import { assertCanInviteAdmin } from "@/utils/adminAccess";
import { createError, generateToken } from "@/utils";

/**
 * Re-issues the single-use link for a pending or expired invitation. The
 * previous token is replaced, so any older email stops working immediately.
 */
export const adminInvitationResend = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const actor = req.user!;
    const { invitationId } = req.params;

    const invitation = await AdminInvitation.findById(invitationId);
    if (!invitation) throw createError("Invitation not found", 404);

    assertCanInviteAdmin(actor, invitation.adminRole);

    if (!["PENDING", "EXPIRED"].includes(invitation.status)) {
      throw createError(
        "Only pending or expired invitations can be resent",
        400,
      );
    }

    const admin = await User.findById(invitation.admin);
    if (!admin || admin.role !== "admin") {
      throw createError("The invited administrator no longer exists", 404);
    }

    if (admin.adminStatus !== "INVITED") {
      throw createError(
        "This administrator has already accepted their invitation or is no longer invited",
        400,
      );
    }

    const settings = await safePlatformSettings();
    const token = generateToken({
      expiresInMinutes: settings.security.invitationExpiryHours * 60,
    });
    const sentAt = new Date();
    const previousState = {
      status: invitation.status,
      expiresAt: invitation.expiresAt
        ? new Date(invitation.expiresAt).toISOString()
        : null,
    };

    invitation.tokenHash = token.hashedToken;
    invitation.status = "PENDING";
    invitation.expiresAt = token.expiresAt;
    invitation.lastSentAt = sentAt;
    invitation.sendCount = (invitation.sendCount ?? 0) + 1;
    invitation.revokedAt = null;
    invitation.revokedBy = null;
    await invitation.save();

    admin.passwordResetToken = token.hashedToken;
    admin.passwordResetTokenExpiryDate = token.expiresAt;
    admin.otpLastSentAt = sentAt;
    await admin.save();

    await recordActivity({
      type: "admin_action",
      channel: "administration",
      title: "Admin invitation resent",
      description: `${actor.name} resent the invitation for ${admin.name}.`,
      actor: actorFromUser(actor),
      subject: { type: "admin", id: admin._id, label: admin.name },
      href: `/admins/${String(admin._id)}`,
      metadata: { invitationId: String(invitation._id) },
    });

    await recordAudit({
      actor: auditActorFromUser(actor),
      action: "admin.invitation_resent",
      entityType: "invitation",
      entityId: invitation._id,
      entityLabel: admin.email,
      previousState,
      newState: {
        status: "PENDING",
        expiresAt: token.expiresAt.toISOString(),
        sendCount: invitation.sendCount,
      },
      metadata: { adminId: String(admin._id) },
      request: requestMetadata(req),
    });

    const { html, text } = adminInvitationTemplate({
      name: admin.name,
      role: invitation.adminRole,
      link: `${ADMIN_URL}/accept-invitation/${token.token}`,
      expiresInHours: settings.security.invitationExpiryHours,
    });

    await sendMail({
      to: admin.email,
      subject: "Your Routiq admin invitation",
      html,
      text,
    });

    res.status(200).json({
      message: "Invitation resent successfully",
      success: true,
      data: { invitation: serialiseAdminInvitation(invitation) },
    });
  } catch (error) {
    next(error);
  }
};
