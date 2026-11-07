import type { NextFunction, Request, Response } from "express";
import { permissionsForAdmin } from "@/config/permissions";
import type { UserDocument } from "@/models/user.model";
import { assertActiveAdmin } from "@/utils/adminAccess";
import { generateJwtToken } from "@/utils";

export const adminRefresh = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const admin = assertActiveAdmin(req.user as UserDocument);
    const token = generateJwtToken(admin._id.toString(), true);

    res.status(200).json({
      message: "Generated access token successfully",
      success: true,
      data: {
        ...token,
        permissions: permissionsForAdmin(admin),
      },
    });
  } catch (error) {
    next(error);
  }
};
