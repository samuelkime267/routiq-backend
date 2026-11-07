import type { NextFunction, Request, Response } from "express";
import User from "@/models/user.model";
import type { VendorStatusSchemaType } from "@/schemas/vendor";
import { assertPermission } from "@/utils/adminAccess";
import { createError } from "@/utils";
import { actorFromUser, recordActivity } from "@/lib/activity";
import { notifyVendor } from "@/services/notifications/notify";

export const updateVendorStatus = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const admin = assertPermission(req.user, ["vendors.manage"]);
    const { status, reason } = req.body as VendorStatusSchemaType;

    const vendor = await User.findOne({
      _id: req.params.vendorId,
      role: "vendor",
    });
    if (!vendor) throw createError("Vendor not found", 404);

    const previousStatus = vendor.status;

    if (status === "suspended") {
      vendor.status = "suspended";
      vendor.suspensionReason = reason ?? null;
      vendor.suspendedAt = new Date();
      vendor.suspendedBy = admin._id as never;
    } else {
      vendor.status = "active";
      vendor.suspensionReason = null;
      vendor.suspendedAt = null;
      vendor.suspendedBy = null;
    }

    await vendor.save();

    const suspended = status === "suspended";

    await recordActivity({
      type: "admin_action",
      channel: "administration",
      title: suspended ? "Vendor suspended" : "Vendor reactivated",
      description: suspended
        ? `${vendor.name} was suspended. Reason: ${reason ?? "Not provided"}.`
        : `${vendor.name} was reactivated.`,
      actor: actorFromUser(admin),
      subject: { type: "vendor", id: vendor._id, label: vendor.name },
      href: `/vendors/${String(vendor._id)}`,
      metadata: { fromStatus: previousStatus, toStatus: vendor.status, reason },
    });

    await notifyVendor({
      recipient: vendor._id,
      type: suspended ? "vendor_suspended" : "vendor_reactivated",
      title: suspended
        ? "Your vendor account has been suspended"
        : "Your vendor account is active again",
      message: suspended
        ? `Your Routiq vendor account has been suspended. ${reason ?? ""}`.trim()
        : "Your Routiq vendor account has been reactivated. You can resume trading.",
      href: "/",
      metadata: { status: vendor.status, reason: reason ?? null },
    });

    res.status(200).json({
      message: suspended
        ? "Vendor suspended successfully"
        : "Vendor reactivated successfully",
      success: true,
      data: { vendor: vendor.toJSON() },
    });
  } catch (error) {
    next(error);
  }
};
