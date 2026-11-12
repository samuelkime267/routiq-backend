import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import AdminNote from "@/models/adminNote.model";
import Store from "@/models/store.model";
import User from "@/models/user.model";
import type { CreateVendorNoteSchemaType } from "@/schemas/vendor";
import { assertPermission } from "@/utils/adminAccess";
import { createError } from "@/utils";
import { actorFromUser, recordActivity } from "@/lib/activity";
import { auditActorFromUser, recordAudit, requestMetadata } from "@/lib/audit";

export const createVendorNote = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const admin = assertPermission(req.user, ["vendors.manage"]);
    const { body, storeId } = req.body as CreateVendorNoteSchemaType;

    const vendor = await User.findOne({
      _id: req.params.vendorId,
      role: "vendor",
    });
    if (!vendor) throw createError("Vendor not found", 404);

    if (storeId) {
      const store = await Store.exists({
        _id: storeId,
        owner: vendor._id,
      });
      if (!store) throw createError("Store not found for this vendor", 404);
    }

    const note = await AdminNote.create({
      vendor: new mongoose.Types.ObjectId(String(vendor._id)),
      store: storeId
        ? new mongoose.Types.ObjectId(String(storeId))
        : null,
      body,
      author: new mongoose.Types.ObjectId(String(admin._id)),
    });

    await recordActivity({
      type: "admin_action",
      channel: "administration",
      title: "Administrative note added",
      description: `A note was added to ${vendor.name}'s vendor profile.`,
      actor: actorFromUser(admin),
      subject: { type: "vendor", id: vendor._id, label: vendor.name },
      href: `/vendors/${String(vendor._id)}`,
      metadata: { noteId: String(note._id), storeId: storeId ?? null },
    });

    await recordAudit({
      actor: auditActorFromUser(admin),
      action: "vendor.note_added",
      entityType: "vendor",
      entityId: vendor._id,
      entityLabel: vendor.name,
      previousState: null,
      newState: { noteId: String(note._id), storeId: storeId ?? null },
      reason: null,
      metadata: { bodyLength: body.length },
      request: requestMetadata(req),
    });

    await note.populate("author", "name email adminRole");

    res.status(201).json({
      message: "Vendor note added successfully",
      success: true,
      data: { note },
    });
  } catch (error) {
    next(error);
  }
};
