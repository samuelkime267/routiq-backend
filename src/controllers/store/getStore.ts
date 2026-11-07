import { NextFunction, Request, Response } from "express";
import Store from "@/models/store.model";
import { createError } from "@/utils";

export const getStore = async (
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
      throw createError("You do not have permission to view this store", 403);
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
