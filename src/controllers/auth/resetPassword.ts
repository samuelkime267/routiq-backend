import User from "@/models/user.model";
import { NextFunction, Request, Response } from "express";
import { CustomError } from "@/types";
import { hashKey } from "@/utils";
import { UpdatePasswordSchemaType } from "@/schemas/auth";
import bcrypt from "bcryptjs";

export const resetPassword = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { token } = req.params;
    const { password } = req.body as UpdatePasswordSchemaType;

    if (typeof token !== "string") {
      const error = new Error() as CustomError;
      error.message = "Invalid token format";
      error.statusCode = 400;
      throw error;
    }

    const hashedToken = hashKey(token);
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetTokenExpiryDate: { $gt: Date.now() },
    });

    if (!user) {
      const error = new Error() as CustomError;
      error.message = "Invalid or expired token";
      error.statusCode = 400;
      throw error;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    user.password = hashedPassword;
    user.passwordResetToken = undefined;
    user.passwordResetTokenExpiryDate = undefined;
    user.otpAttempts = 0;

    await user.save();

    res.status(200).json({
      message: "Password reset successfully",
      success: true,
    });
  } catch (error) {
    next(error);
  }
};
