import type { NextFunction, Request, Response } from "express";
import { ADMIN_URL } from "@/config/env";
import { permissionsForAdmin } from "@/config/permissions";
import { actorFromUser, recordActivity } from "@/lib/activity";
import { sendMail } from "@/lib/mail/mailer";
import { adminInvitationTemplate } from "@/lib/mail/template";
import User from "@/models/user.model";
import type { AdminInviteSchemaType } from "@/schemas/admin";
import { assertCanInviteAdmin, syncAdminStatusFields } from "@/utils/adminAccess";
import { createError } from "@/utils/createError";
import { generateToken } from "@/utils";

export const adminInvite = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const actor = req.user;
    const { name, email, adminRole } = req.body as AdminInviteSchemaType;
    const normalizedEmail = email.toLowerCase();

    assertCanInviteAdmin(actor!, adminRole);

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

    const invitation = generateToken();
    const invitedAt = new Date();

    if (admin) {
      admin.name = name;
      admin.adminRole = adminRole;
      admin.permissionGrants = [];
      admin.permissionRevocations = [];
      admin.invitedBy = actor?._id;
      admin.invitedAt = invitedAt;
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
        invitedBy: actor?._id,
        invitedAt,
        passwordResetToken: invitation.hashedToken,
        passwordResetTokenExpiryDate: invitation.expiresAt,
        otpAttempts: 1,
        otpLastSentAt: invitedAt,
        ...syncAdminStatusFields("INVITED"),
      });
    }

    await recordActivity({
      type: "admin_action",
      channel: "administration",
      title: "Administrator invited",
      description: `${actor?.name ?? "An administrator"} invited ${admin.name} as ${adminRole
        .toLowerCase()
        .replace(/_/g, " ")}.`,
      actor: actorFromUser(actor),
      subject: { type: "admin", id: admin._id, label: admin.name },
      href: `/admins?search=${encodeURIComponent(admin.email)}`,
      metadata: { adminRole },
    });

    const { html, text } = adminInvitationTemplate({
      name: admin.name,
      role: adminRole,
      link: `${ADMIN_URL}/reset-password/${invitation.token}`,
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
        permissions: permissionsForAdmin(admin),
      },
    });
  } catch (error) {
    next(error);
  }
};
