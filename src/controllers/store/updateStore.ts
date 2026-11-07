import { NextFunction, Request, Response } from "express";
import Store from "@/models/store.model";
import { UpdateStoreSchemaType } from "@/schemas/store";
import { recordStoreHistory } from "@/services/store/history";
import { createError } from "@/utils";

export const updateStore = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user;
    if (!user) throw createError("User not authenticated", 401);

    const store = await Store.findById(req.params.id);
    if (!store) throw createError("Store not found", 404);

    const isOwner = store.owner.toString() === user._id.toString();
    if (user.role !== "admin" && !isOwner) {
      throw createError("You do not have permission to update this store", 403);
    }

    if (user.role !== "admin" && !["pending", "rejected"].includes(store.status)) {
      throw createError(
        "A store can only be updated while pending or rejected",
        400,
      );
    }

    const updates = req.body as UpdateStoreSchemaType;

    if (updates.slug && updates.slug !== store.slug) {
      const existingSlug = await Store.exists({ slug: updates.slug });
      if (existingSlug) {
        throw createError("Store slug is already taken", 400);
      }
    }

    Object.assign(store, updates);

    const resubmitting = user.role !== "admin";

    if (resubmitting) {
      store.status = "pending";
      store.submittedAt = new Date();
      store.rejectionReason = null;
      store.reviewedAt = null;
      store.reviewedBy = null;
      store.suspensionReason = null;
      store.suspendedAt = null;
      store.suspendedBy = null;
    }

    await store.save();

    if (resubmitting) {
      await recordStoreHistory({
        store: store._id,
        action: "resubmitted",
        fromStatus: "rejected",
        toStatus: "pending",
        actor: user._id,
        actorRole: "vendor",
      });
    }

    res.status(200).json({
      message: "Store updated successfully",
      success: true,
      data: { store },
    });
  } catch (error) {
    next(error);
  }
};
