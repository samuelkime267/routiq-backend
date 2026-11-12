import type { NextFunction, Request, Response } from "express";
import { Types } from "mongoose";
import { permissionsForAdmin } from "@/config/permissions";
import AdminInvitation from "@/models/adminInvitation.model";
import User from "@/models/user.model";
import { listAdminsQuerySchema } from "@/schemas/admin";

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Server-side administrator directory. Filters can be combined: role,
 * lifecycle status, invitation status and a text search all narrow the same
 * query, and the summary counts are derived from the unfiltered admin set.
 */
export const adminList = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const {
      role,
      status,
      invitationStatus,
      search,
      sortBy,
      sortOrder,
      page,
      limit,
    } = listAdminsQuerySchema.parse(req.query);

    const query = User.find({ role: "admin" });

    if (role) query.where("adminRole", role);
    if (status) query.where("adminStatus", status);

    if (invitationStatus) {
      const invitedAdminIds = await AdminInvitation.find({
        status: invitationStatus,
      }).distinct("admin");

      query.where("_id").in(invitedAdminIds);
    }

    if (search) {
      const pattern = new RegExp(escapeRegExp(search), "i");
      query.or([{ name: pattern }, { email: pattern }]);
    }

    const sort: Record<string, 1 | -1> =
      // Legacy user documents predate schema timestamps. ObjectId creation
      // order is the reliable fallback for the "Created" sort.
      sortBy === "createdAt"
        ? { _id: sortOrder === "asc" ? 1 : -1 }
        : { [sortBy]: sortOrder === "asc" ? 1 : -1 };
    const skip = (page - 1) * limit;

    const [admins, total, statusRows] = await Promise.all([
      query.sort(sort).skip(skip).limit(limit),
      User.countDocuments(query.getFilter()),
      User.aggregate<{ _id: string; count: number }>([
        { $match: { role: "admin" } },
        { $group: { _id: "$adminStatus", count: { $sum: 1 } } },
      ]),
    ]);

    const adminIds = admins.map((admin) => admin._id);
    const invitations = adminIds.length
      ? await AdminInvitation.find({ admin: { $in: adminIds } })
          .sort({ createdAt: -1 })
          .lean()
      : [];

    const latestInvitation = new Map<string, (typeof invitations)[number]>();
    const invitationCounts = new Map<string, number>();

    for (const invitation of invitations) {
      const adminId = String(invitation.admin);
      invitationCounts.set(adminId, (invitationCounts.get(adminId) ?? 0) + 1);

      if (!latestInvitation.has(adminId)) {
        latestInvitation.set(adminId, invitation);
      }
    }

    const summary = {
      total: 0,
      active: 0,
      invited: 0,
      suspended: 0,
      deactivated: 0,
    };

    for (const row of statusRows) {
      summary.total += row.count;
      if (row._id === "ACTIVE") summary.active = row.count;
      if (row._id === "INVITED") summary.invited = row.count;
      if (row._id === "SUSPENDED") summary.suspended = row.count;
      if (row._id === "DEACTIVATED") summary.deactivated = row.count;
    }

    res.status(200).json({
      message: "Admins retrieved successfully",
      success: true,
      data: {
        admins: admins.map((admin) => {
          const json = admin.toJSON();
          const invitation = latestInvitation.get(String(admin._id));

          return {
            admin: {
              ...json,
              createdAt:
                admin.createdAt ??
                new Types.ObjectId(String(admin._id)).getTimestamp(),
            },
            permissions: permissionsForAdmin(admin),
            invitation: invitation
              ? {
                  _id: String(invitation._id),
                  status: invitation.status,
                  adminRole: invitation.adminRole,
                  expiresAt: invitation.expiresAt ?? null,
                  lastSentAt: invitation.lastSentAt ?? null,
                  acceptedAt: invitation.acceptedAt ?? null,
                  sendCount: invitation.sendCount ?? 0,
                }
              : null,
            invitationCount: invitationCounts.get(String(admin._id)) ?? 0,
          };
        }),
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
