import type { NextFunction, Request, Response } from "express";
import { actorFromUser, recordActivity } from "@/lib/activity";
import { auditActorFromUser, recordAudit, requestMetadata } from "@/lib/audit";
import AdminInvitation from "@/models/adminInvitation.model";
import User from "@/models/user.model";
import type { AdminInvitationActionSchemaType } from "@/schemas/admin";
import { serialiseAdminInvitation } from "@/services/admins";
import { assertCanManageAdmin, syncAdminStatusFields } from "@/utils/adminAccess";
import { createError } from "@/utils";

export const adminInvitationRevoke = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const actor = req.user!;
    const { invitationId } = req.params;
    const { reason } = req.body as AdminInvitationActionSchemaType;

    const invitation = await AdminInvitation.findById(invitationId);
    if (!invitation) throw createError("Invitation not found", 404);

    if (!["PENDING", "EXPIRED"].includes(invitation.status)) {
      throw createError(
        "Only pending or expired invitations can be revoked",
        400,
      );
    }

    const admin = await User.findById(invitation.admin);
    if (admin) {
      assertCanManageAdmin(actor, admin);
    }

    const revokedAt = new Date();

    invitation.status = "REVOKED";
    invitation.revokedAt = revokedAt;
    invitation.revokedBy = actor._id;
    await invitation.save();

    if (admin && admin.adminStatus === "INVITED") {
      Object.assign(admin, syncAdminStatusFields("DEACTIVATED"));
      admin.passwordResetToken = null;
      admin.passwordResetTokenExpiryDate = null;
      await admin.save();
    }

    await recordActivity({
      type: "admin_action",
      channel: "administration",
      title: "Admin invitation revoked",
      description: `${actor.name} revoked the invitation for ${invitation.email}.`,
      actor: actorFromUser(actor),
      subject: {
        type: "admin",
        id: invitation.admin,
        label: invitation.name,
      },
      href: `/admins/${String(invitation.admin)}`,
      metadata: { invitationId: String(invitation._id) },
    });

    await recordAudit({
      actor: auditActorFromUser(actor),
      action: "admin.invitation_revoked",
      entityType: "invitation",
      entityId: invitation._id,
      entityLabel: invitation.email,
      previousState: { status: "PENDING" },
      newState: { status: "REVOKED", revokedAt: revokedAt.toISOString() },
      reason: reason ?? null,
      metadata: { adminId: String(invitation.admin) },
      request: requestMetadata(req),
    });

    res.status(200).json({
      message: "Invitation revoked successfully",
      success: true,
      data: { invitation: serialiseAdminInvitation(invitation) },
    });
  } catch (error) {
    next(error);
  }
};
