import type { NextFunction, Request, Response } from "express";
import Token from "@/models/token.model";
import type { UserDocument } from "@/models/user.model";
import { createError } from "@/utils/createError";
import { assertActiveAdmin } from "@/utils/adminAccess";
import { clearRefreshTokenCookieOptions } from "@/utils";

export const adminLogout = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const admin = assertActiveAdmin(req.user as UserDocument);
    const { refreshToken } = req.cookies;
    const { tokenExpiryDate } = req;

    if (!refreshToken || !tokenExpiryDate) {
      throw createError("User not authenticated", 401);
    }

    const denylisted = await Token.findOne({ refreshToken });
    if (denylisted) {
      throw createError("User already logged out", 400);
    }

    await Token.create([
      {
        refreshToken,
        tokenExpiryDate,
        user: admin._id,
      },
    ]);

    res
      .clearCookie("refreshToken", clearRefreshTokenCookieOptions)
      .status(200)
      .json({ message: "Admin logged out successfully", success: true });
  } catch (error) {
    next(error);
  }
};
