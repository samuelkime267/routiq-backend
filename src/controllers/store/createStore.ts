import { NextFunction, Request, Response } from "express";
import Store from "@/models/store.model";
import { CreateStoreSchemaType } from "@/schemas/store";
import { createError, generateStoreSlug } from "@/utils";
import { actorFromUser, recordActivity } from "@/lib/activity";
import { recordStoreHistory } from "@/services/store/history";

export const createStore = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user;
    if (!user) throw createError("User not authenticated", 401);

    const payload = req.body as CreateStoreSchemaType;

    if (user.role === "vendor" && (await Store.exists({ owner: user._id }))) {
      throw createError(
        "You already have a store. Each vendor account manages one store.",
        400,
      );
    }

    if (payload.slug) {
      const existingSlug = await Store.findOne({ slug: payload.slug });
      if (existingSlug) {
        throw createError("Store slug is already taken", 400);
      }
    }

    let slug = payload.slug;
    if (!slug) {
      do {
        slug = generateStoreSlug(payload.name);
      } while (await Store.exists({ slug }));
    }

    const store = await Store.create({
      ...payload,
      slug,
      owner: user._id,
      status: "pending",
      submittedAt: new Date(),
    });

    await recordStoreHistory({
      store: store._id,
      action: "submitted",
      toStatus: "pending",
      actor: user._id,
      actorRole: "vendor",
    });

    await recordActivity({
      type: "store_submitted",
      title: "New store submitted",
      description: `${store.name} was submitted for onboarding review.`,
      actor: actorFromUser(user),
      subject: { type: "store", id: store._id, label: store.name },
      href: `/vendors?search=${encodeURIComponent(store.name)}`,
      metadata: { status: store.status },
    });

    res.status(201).json({
      message: "Store onboarding submitted successfully",
      success: true,
      data: { store },
    });
  } catch (error) {
    next(error);
  }
};
