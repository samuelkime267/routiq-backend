import type { NextFunction, Request, Response } from "express";
import AdminInvitation, {
  ADMIN_INVITATION_STATUSES,
} from "@/models/adminInvitation.model";
import { listAdminInvitationsQuerySchema } from "@/schemas/admin";
import { serialiseAdminInvitation } from "@/services/admins";

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const adminInvitationList = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { status, role, search, sortBy, sortOrder, page, limit } =
      listAdminInvitationsQuerySchema.parse(req.query);

    const query = AdminInvitation.find();

    if (status) query.where("status", status);
    if (role) query.where("adminRole", role);

    if (search) {
      const pattern = new RegExp(escapeRegExp(search), "i");
      query.or([{ name: pattern }, { email: pattern }]);
    }

    const skip = (page - 1) * limit;

    const [invitations, total, statusRows] = await Promise.all([
      query
        .clone()
        .populate("admin", "name email adminRole adminStatus lastLoginAt")
        .populate("invitedBy", "name email adminRole")
        .populate("revokedBy", "name email adminRole")
        .sort({ [sortBy]: sortOrder === "asc" ? 1 : -1, _id: -1 })
        .skip(skip)
        .limit(limit),
      AdminInvitation.countDocuments(query.getFilter()),
      AdminInvitation.aggregate<{ _id: string; count: number }>([
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
    ]);

    const summary = ADMIN_INVITATION_STATUSES.reduce<Record<string, number>>(
      (accumulator, invitationStatus) => {
        accumulator[invitationStatus] = 0;
        return accumulator;
      },
      {},
    );

    for (const row of statusRows) {
      if (row._id in summary) summary[row._id] = row.count;
    }

    res.status(200).json({
      message: "Admin invitations retrieved successfully",
      success: true,
      data: {
        invitations: invitations.map(serialiseAdminInvitation),
        summary,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};
