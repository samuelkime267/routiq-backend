import type { NextFunction, Request, Response } from "express";
import { permissionsForAdmin } from "@/config/permissions";
import type { UserDocument } from "@/models/user.model";
import { assertActiveAdmin } from "@/utils/adminAccess";

export const adminMe = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const admin = assertActiveAdmin(req.user as UserDocument);

    res.status(200).json({
      message: "Admin profile retrieved successfully",
      success: true,
      data: {
        user: admin,
        permissions: permissionsForAdmin(admin),
      },
    });
  } catch (error) {
    next(error);
  }
};
