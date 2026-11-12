import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import AdminInvitation from "@/models/adminInvitation.model";
import { serialiseAdminInvitation } from "@/services/admins";
import { createError } from "@/utils";

export const adminInvitationDetail = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { invitationId } = req.params;

    if (typeof invitationId !== "string" || !mongoose.isValidObjectId(invitationId)) {
      throw createError("Invitation not found", 404);
    }

    const invitation = await AdminInvitation.findById(invitationId)
      .populate("admin", "name email adminRole adminStatus lastLoginAt")
      .populate("invitedBy", "name email adminRole")
      .populate("revokedBy", "name email adminRole");

    if (!invitation) throw createError("Invitation not found", 404);

    res.status(200).json({
      message: "Invitation retrieved successfully",
      success: true,
      data: {
        invitation: serialiseAdminInvitation(invitation),
        admin: invitation.admin ?? null,
      },
    });
  } catch (error) {
    next(error);
  }
};
