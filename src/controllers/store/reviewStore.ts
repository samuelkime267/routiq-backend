import { NextFunction, Request, Response } from "express";
import Store from "@/models/store.model";
import { ReviewStoreSchemaType } from "@/schemas/store";
import { createError } from "@/utils";
import { actorFromUser, recordActivity } from "@/lib/activity";
import { auditActorFromUser, recordAudit, requestMetadata } from "@/lib/audit";
import { assertPermission } from "@/utils/adminAccess";
import { recordStoreHistory } from "@/services/store/history";
import { notifyVendor } from "@/services/notifications/notify";
import type { Permission } from "@/config/permissions";

const reviewPermission = (status: ReviewStoreSchemaType["status"]): Permission => {
  if (status === "approved") return "stores.approve";
  if (status === "rejected") return "stores.reject";

  return "stores.suspend";
};

export const reviewStore = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const admin = req.user;
    if (!admin) throw createError("User not authenticated", 401);

    const store = await Store.findById(req.params.id);
    if (!store) throw createError("Store not found", 404);

    if (!["pending", "rejected"].includes(store.status)) {
      throw createError("Only pending or rejected stores can be reviewed", 400);
    }

    const { status, rejectionReason } = req.body as ReviewStoreSchemaType;
    const fromStatus = store.status;

    assertPermission(admin, [reviewPermission(status)]);

    store.status = status;
    store.rejectionReason = status === "rejected" ? rejectionReason! : null;
    store.reviewedAt = new Date();
    store.reviewedBy = admin._id;

    if (status === "suspended") {
      store.suspensionReason = rejectionReason ?? null;
      store.suspendedAt = new Date();
      store.suspendedBy = admin._id;
    }

    await store.save();

    await recordStoreHistory({
      store: store._id,
      action:
        status === "approved"
          ? "approved"
          : status === "rejected"
            ? "rejected"
            : status === "suspended"
              ? "suspended"
              : "closed",
      fromStatus,
      toStatus: status,
      actor: admin._id,
      actorRole: "admin",
      reason: rejectionReason ?? null,
    });

    if (status !== "closed") {
      await notifyVendor({
        recipient: store.owner,
        type:
          status === "approved"
            ? "store_approved"
            : status === "rejected"
              ? "store_rejected"
              : "store_suspended",
        title:
          status === "approved"
            ? "Your store is approved"
            : status === "rejected"
              ? "Your store application needs changes"
              : "Your store has been suspended",
        message:
          status === "approved"
            ? `${store.name} has been approved. You can now publish products and start selling.`
            : status === "rejected"
              ? `We could not approve ${store.name}. ${rejectionReason ?? ""}`.trim()
              : `${store.name} has been suspended. ${rejectionReason ?? ""}`.trim(),
        href: `/onboarding/${String(store._id)}`,
        metadata: { storeId: String(store._id), status },
      });
    }

    await recordActivity({
      type:
        status === "approved"
          ? "store_approved"
          : status === "rejected"
            ? "store_rejected"
            : "admin_action",
      title:
        status === "approved"
          ? "Store approved"
          : status === "rejected"
            ? "Store rejected"
            : `Store ${status}`,
      description: `${store.name} was ${status} by ${admin.name}.`,
      actor: actorFromUser(admin),
      subject: { type: "store", id: store._id, label: store.name },
      href: `/vendors?search=${encodeURIComponent(store.name)}`,
      metadata: {
        status,
        rejectionReason: store.rejectionReason ?? null,
      },
    });

    await recordAudit({
      actor: auditActorFromUser(admin),
      action: `store.${status === "approved" ? "approved" : status === "rejected" ? "rejected" : "suspended"}`,
      entityType: "store",
      entityId: store._id,
      entityLabel: store.name,
      previousState: { status: fromStatus },
      newState: {
        status,
        rejectionReason: store.rejectionReason ?? null,
      },
      reason: rejectionReason ?? null,
      request: requestMetadata(req),
    });

    res.status(200).json({
      message: `Store ${status} successfully`,
      success: true,
      data: { store },
    });
  } catch (error) {
    next(error);
  }
};
