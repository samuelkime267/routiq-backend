import Token from "@/models/token.model";
import { CustomError } from "@/types";
import { clearRefreshTokenCookieOptions } from "@/utils";
import { NextFunction, Request, Response } from "express";

export const logout = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { user, tokenExpiryDate } = req;
    const { refreshToken } = req.cookies;
    if (!user || !tokenExpiryDate || !refreshToken) {
      const error = new Error("User not authenticated") as CustomError;
      error.statusCode = 401;
      throw error;
    }

    const token = await Token.findOne({ refreshToken });

    if (token) {
      const error = new Error("User already logged out") as CustomError;
      error.statusCode = 400;
      throw error;
    }

    await Token.create([
      {
        refreshToken,
        tokenExpiryDate,
        user: user._id,
      },
    ]);

    res
      .clearCookie("refreshToken", clearRefreshTokenCookieOptions)
      .status(200)
      .json({ message: "User logged out successfully", success: true });
  } catch (error) {
    next(error);
  }
};
