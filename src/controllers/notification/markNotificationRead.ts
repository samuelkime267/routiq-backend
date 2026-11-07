import type { NextFunction, Request, Response } from "express";
import Notification from "@/models/notification.model";
import { createError } from "@/utils";

export const markNotificationRead = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user;
    if (!user) throw createError("User not authenticated", 401);

    const notification = await Notification.findOne({
      _id: req.params.notificationId,
      recipient: user._id,
    });

    if (!notification) throw createError("Notification not found", 404);

    if (!notification.readAt) {
      notification.readAt = new Date();
      await notification.save();
    }

    res.status(200).json({
      message: "Notification marked as read",
      success: true,
      data: { notification },
    });
  } catch (error) {
    next(error);
  }
};
