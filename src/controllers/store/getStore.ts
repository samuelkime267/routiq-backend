import { NextFunction, Request, Response } from "express";
import Store from "@/models/store.model";
import { getPublicStore } from "@/services/marketplace/stores";
import { createError, isActiveAdmin } from "@/utils";

export const getStore = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user;

    // Public visitors, customers and other vendors see the safe storefront
    // contract. Owners and administrators keep the full operational record.
    if (!user || (!isActiveAdmin(user) && user.role !== "vendor")) {
      const store = await getPublicStore(String(req.params.id));

      res.status(200).json({
        message: "Store retrieved successfully",
        success: true,
        data: { store },
      });
      return;
    }

    const store = await Store.findById(String(req.params.id));
    if (!store) throw createError("Store not found", 404);

    const isOwner = store.owner.toString() === user._id.toString();

    if (!isActiveAdmin(user) && !isOwner) {
      const publicStore = await getPublicStore(String(req.params.id));

      res.status(200).json({
        message: "Store retrieved successfully",
        success: true,
        data: { store: publicStore },
      });
      return;
    }

    await store.populate("owner", "name email role");

    res.status(200).json({
      message: "Store retrieved successfully",
      success: true,
      data: { store },
    });
  } catch (error) {
    next(error);
  }
};
