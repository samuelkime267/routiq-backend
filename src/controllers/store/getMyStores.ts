import { NextFunction, Request, Response } from "express";
import Store from "@/models/store.model";
import { createError } from "@/utils";

export const getMyStores = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user;
    if (!user) throw createError("User not authenticated", 401);

    const stores = await Store.find({ owner: user._id }).sort({
      createdAt: -1,
    });

    res.status(200).json({
      message: "Stores retrieved successfully",
      success: true,
      data: { stores },
    });
  } catch (error) {
    next(error);
  }
};
