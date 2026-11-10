import type { NextFunction, Request, Response } from "express";
import User from "@/models/user.model";
import type { UpdateUserStatusInput } from "@/schemas/user";
import { createError } from "@/utils";
import { assertPermission } from "@/utils/adminAccess";
import { actorFromUser, recordActivity } from "@/lib/activity";
import { notifyVendor } from "@/services/notifications/notify";

/**
 * Suspend or reactivate a customer/vendor account.
 *
 * Administrative accounts are excluded: their lifecycle is governed by the
 * admin invitation and admin-status endpoints, so this route cannot be used to
 * bypass privilege-escalation guards. A suspension always requires a reason.
 */
export const updateUserStatus = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const admin = assertPermission(req.user, ["users.manage"]);
    const { status, reason } = req.body as UpdateUserStatusInput;

    const user = await User.findOne({
      _id: req.params.userId,
      role: { $in: ["user", "vendor"] },
    });
    if (!user) throw createError("User not found", 404);

    const previousStatus = user.status;
    const suspended = status === "suspended";

    if (suspended) {
      user.status = "suspended";
      user.suspensionReason = reason ?? null;
      user.suspendedAt = new Date();
      user.suspendedBy = admin._id as never;
    } else {
      user.status = "active";
      user.suspensionReason = null;
      user.suspendedAt = null;
      user.suspendedBy = null;
    }

    user.updatedAt = new Date();
    await user.save();

    await recordActivity({
      type: "admin_action",
      channel: "administration",
      title: suspended ? "Account suspended" : "Account reactivated",
      description: suspended
        ? `${user.name} was suspended. Reason: ${reason ?? "Not provided"}.`
        : `${user.name} was reactivated.`,
      actor: actorFromUser(admin),
      subject: { type: "user", id: user._id, label: user.name },
      href: `/customers/${String(user._id)}`,
      metadata: {
        accountRole: user.role,
        fromStatus: previousStatus,
        toStatus: user.status,
        reason: reason ?? null,
      },
    });

    if (user.role === "vendor") {
      await notifyVendor({
        recipient: user._id,
        type: suspended ? "vendor_suspended" : "vendor_reactivated",
        title: suspended
          ? "Your vendor account has been suspended"
          : "Your vendor account is active again",
        message: suspended
          ? `Your Routiq vendor account has been suspended. ${reason ?? ""}`.trim()
          : "Your Routiq vendor account has been reactivated. You can resume trading.",
        href: "/",
        metadata: { status: user.status, reason: reason ?? null },
      });
    }

    res.status(200).json({
      message: suspended
        ? "User account suspended successfully"
        : "User account reactivated successfully",
      success: true,
      data: {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
          suspensionReason: user.suspensionReason,
          suspendedAt: user.suspendedAt,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};
