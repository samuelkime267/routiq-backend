import type { NextFunction, Request, Response } from "express";
import mongoose, { Types } from "mongoose";
import { permissionsForAdmin } from "@/config/permissions";
import AuditLog from "@/models/auditLog.model";
import AdminInvitation from "@/models/adminInvitation.model";
import User from "@/models/user.model";
import { serialiseAdminInvitation } from "@/services/admins";
import { createError } from "@/utils";

/**
 * Full administrator record for the details screen: permissions, invitation
 * history and the most recent audit entries that affected the account.
 */
export const getAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { adminId } = req.params;

    if (typeof adminId !== "string" || !mongoose.isValidObjectId(adminId)) {
      throw createError("Admin not found", 404);
    }

    const admin = await User.findOne({ _id: adminId, role: "admin" });
    if (!admin || !admin.adminRole) {
      throw createError("Admin not found", 404);
    }

    const [invitations, auditLogs] = await Promise.all([
      AdminInvitation.find({ admin: admin._id })
        .sort({ createdAt: -1 })
        .limit(20),
      AuditLog.find({ entityType: "admin", entityId: String(admin._id) })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
    ]);

    res.status(200).json({
      message: "Admin retrieved successfully",
      success: true,
      data: {
        admin: {
          ...admin.toJSON(),
          createdAt:
            admin.createdAt ??
            new Types.ObjectId(String(admin._id)).getTimestamp(),
        },
        permissions: permissionsForAdmin(admin),
        invitation: invitations[0]
          ? serialiseAdminInvitation(invitations[0])
          : null,
        invitations: invitations.map(serialiseAdminInvitation),
        auditLogs,
      },
    });
  } catch (error) {
    next(error);
  }
};
