import type { NextFunction, Request, Response } from "express";
import Notification from "@/models/notification.model";
import { listNotificationsQuerySchema } from "@/schemas/notification";
import { createError } from "@/utils";

export const listNotifications = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user;
    if (!user) throw createError("User not authenticated", 401);

    const { unreadOnly, page, limit } = listNotificationsQuerySchema.parse(
      req.query,
    );

    const filter: Record<string, unknown> = { recipient: user._id };
    if (unreadOnly) filter.readAt = null;

    const skip = (page - 1) * limit;
    const [notifications, total, unread] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Notification.countDocuments(filter),
      Notification.countDocuments({ recipient: user._id, readAt: null }),
    ]);

    res.status(200).json({
      message: "Notifications retrieved successfully",
      success: true,
      data: {
        notifications,
        unread,
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
