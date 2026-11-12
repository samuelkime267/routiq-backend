import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import AuditLog from "@/models/auditLog.model";
import User from "@/models/user.model";
import { listAuditLogsQuerySchema } from "@/schemas/audit";

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const regex = (value: string) => new RegExp(escapeRegExp(value), "i");

function endOfDayIfDateOnly(value: string) {
  const date = new Date(value);

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    date.setUTCHours(23, 59, 59, 999);
  }

  return date;
}

/**
 * Read-only audit directory. There is deliberately no write route: entries are
 * created as a side effect of the action they describe.
 */
export const listAuditLogs = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const {
      search,
      admin,
      action,
      entityType,
      entityId,
      createdFrom,
      createdTo,
      sortBy,
      sortOrder,
      page,
      limit,
    } = listAuditLogsQuerySchema.parse(req.query);

    const filter: Record<string, unknown> = {};

    if (action) filter.action = action;
    if (entityType) filter.entityType = entityType;
    if (entityId) filter.entityId = entityId;

    if (admin) {
      if (/^[a-f\d]{24}$/i.test(admin)) {
        filter.actor = new mongoose.Types.ObjectId(admin);
      } else {
        const pattern = regex(admin);
        const actorIds = await User.find({
          $or: [
            { name: pattern },
            { email: pattern },
            { adminRole: pattern },
          ],
        }).distinct("_id");

        filter.actor = { $in: actorIds };
      }
    }

    if (createdFrom || createdTo) {
      const createdAt: Record<string, Date> = {};
      if (createdFrom) createdAt.$gte = new Date(createdFrom);
      if (createdTo) createdAt.$lte = endOfDayIfDateOnly(createdTo);
      filter.createdAt = createdAt;
    }

    if (search) {
      const pattern = regex(search);
      filter.$or = [
        { action: pattern },
        { actorName: pattern },
        { actorEmail: pattern },
        { entityLabel: pattern },
        { entityId: pattern },
        { reason: pattern },
      ];
    }

    const skip = (page - 1) * limit;
    const direction = sortOrder === "asc" ? 1 : -1;

    const [logs, total, entityRows, actionRows] = await Promise.all([
      AuditLog.find(filter)
        .sort({ [sortBy]: direction, _id: direction })
        .skip(skip)
        .limit(limit)
        .lean(),
      AuditLog.countDocuments(filter),
      AuditLog.aggregate<{ _id: string; count: number }>([
        { $match: filter },
        { $group: { _id: "$entityType", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      AuditLog.aggregate<{ _id: string; count: number }>([
        { $match: filter },
        { $group: { _id: "$action", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 },
      ]),
    ]);

    res.status(200).json({
      message: "Audit logs retrieved successfully",
      success: true,
      data: {
        logs,
        summary: {
          total,
          entityTypes: entityRows,
          actions: actionRows,
        },
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
