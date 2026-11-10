import type { NextFunction, Request, Response } from "express";
import {
  findUserOrThrow,
  loadUserDetail,
} from "@/services/users/query";

/**
 * User detail with recent orders, transactions and support history. This is the
 * single account record: no separate customer profile is created.
 */
export const getUser = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = await findUserOrThrow(String(req.params.userId));
    const detail = await loadUserDetail(user);

    res.status(200).json({
      message: "User retrieved successfully",
      success: true,
      data: detail,
    });
  } catch (error) {
    next(error);
  }
};
