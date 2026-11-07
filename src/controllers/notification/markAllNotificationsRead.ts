import type { NextFunction, Request, Response } from "express";
import Notification from "@/models/notification.model";
import { createError } from "@/utils";

export const markAllNotificationsRead = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user;
    if (!user) throw createError("User not authenticated", 401);

    const result = await Notification.updateMany(
      { recipient: user._id, readAt: null },
      { $set: { readAt: new Date() } },
    );

    res.status(200).json({
      message: "Notifications marked as read",
      success: true,
      data: { updated: result.modifiedCount },
    });
  } catch (error) {
    next(error);
  }
};
