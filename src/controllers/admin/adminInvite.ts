import type { NextFunction, Request, Response } from "express";
import { ADMIN_URL } from "@/config/env";
import { permissionsForAdmin } from "@/config/permissions";
import { actorFromUser, recordActivity } from "@/lib/activity";
import { auditActorFromUser, recordAudit, requestMetadata } from "@/lib/audit";
import { sendMail } from "@/lib/mail/mailer";
import { adminInvitationTemplate } from "@/lib/mail/template";
import AdminInvitation from "@/models/adminInvitation.model";
import User from "@/models/user.model";
import type { AdminInviteSchemaType } from "@/schemas/admin";
import { serialiseAdminInvitation } from "@/services/admins";
import { safePlatformSettings } from "@/services/settings";
import { assertCanInviteAdmin, syncAdminStatusFields } from "@/utils/adminAccess";
import { createError } from "@/utils/createError";
import { generateToken } from "@/utils";

export const adminInvite = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const actor = req.user!;
    const { name, email, adminRole, reason } = req.body as AdminInviteSchemaType;
    const normalizedEmail = email.toLowerCase();

    assertCanInviteAdmin(actor, adminRole);

    let admin = await User.findOne({ email: normalizedEmail });

    if (admin && admin.role !== "admin") {
      // Never silently promote a customer or vendor account to admin.
      throw createError(
        "An account with this email already exists. Admin access cannot be granted to customer or vendor accounts.",
        400,
      );
    }

    if (admin?.adminStatus === "ACTIVE") {
      throw createError("An active admin already uses this email", 400);
    }

    const settings = await safePlatformSettings();
    const invitation = generateToken({
      expiresInMinutes: settings.security.invitationExpiryHours * 60,
    });
    const invitedAt = new Date();

    if (admin) {
      admin.name = name;
      admin.adminRole = adminRole;
      admin.permissionGrants = [];
      admin.permissionRevocations = [];
      admin.invitedBy = actor._id;
      admin.invitedAt = invitedAt;
      // The reset token keeps the legacy reset-password link working; the
      // invitation record below is the authoritative single-use credential.
      admin.passwordResetToken = invitation.hashedToken;
      admin.passwordResetTokenExpiryDate = invitation.expiresAt;
      admin.otpAttempts = 0;
      admin.otpLastSentAt = invitedAt;
      Object.assign(admin, syncAdminStatusFields("INVITED"));
      await admin.save();
    } else {
      admin = await User.create({
        name,
        email: normalizedEmail,
        role: "admin",
        adminRole,
        permissionGrants: [],
        permissionRevocations: [],
        invitedBy: actor._id,
        invitedAt,
        passwordResetToken: invitation.hashedToken,
        passwordResetTokenExpiryDate: invitation.expiresAt,
        otpAttempts: 0,
        otpLastSentAt: invitedAt,
        ...syncAdminStatusFields("INVITED"),
      });
    }

    // A new invitation supersedes any link that has not been used yet.
    await AdminInvitation.updateMany(
      { admin: admin._id, status: "PENDING" },
      {
        $set: {
          status: "REVOKED",
          revokedAt: invitedAt,
          revokedBy: actor._id,
        },
      },
    );

    const invitationRecord = await AdminInvitation.create({
      admin: admin._id,
      name: admin.name,
      email: admin.email,
      adminRole,
      tokenHash: invitation.hashedToken,
      status: "PENDING",
      expiresAt: invitation.expiresAt,
      invitedBy: actor._id,
      lastSentAt: invitedAt,
      sendCount: 1,
    });

    await recordActivity({
      type: "admin_action",
      channel: "administration",
      title: "Administrator invited",
      description: `${actor.name} invited ${admin.name} as ${adminRole
        .toLowerCase()
        .replace(/_/g, " ")}.`,
      actor: actorFromUser(actor),
      subject: { type: "admin", id: admin._id, label: admin.name },
      href: `/admins/${String(admin._id)}`,
      metadata: { adminRole, invitationId: String(invitationRecord._id) },
    });

    await recordAudit({
      actor: auditActorFromUser(actor),
      action: "admin.invited",
      entityType: "admin",
      entityId: admin._id,
      entityLabel: admin.name,
      previousState: null,
      newState: {
        name: admin.name,
        email: admin.email,
        adminRole,
        adminStatus: "INVITED",
      },
      reason: reason ?? null,
      metadata: {
        invitationId: String(invitationRecord._id),
        invitationExpiresAt: invitation.expiresAt.toISOString(),
      },
      request: requestMetadata(req),
    });

    const { html, text } = adminInvitationTemplate({
      name: admin.name,
      role: adminRole,
      link: `${ADMIN_URL}/accept-invitation/${invitation.token}`,
      expiresInHours: settings.security.invitationExpiryHours,
    });

    await sendMail({
      to: admin.email,
      subject: "You have been invited to the Routiq admin console",
      html,
      text,
    });

    res.status(201).json({
      message: "Admin invited successfully",
      success: true,
      data: {
        admin,
        invitation: serialiseAdminInvitation(invitationRecord),
        permissions: permissionsForAdmin(admin),
      },
    });
  } catch (error) {
    next(error);
  }
};
