import { UserDocument } from "@/models/user.model";
import { NextFunction, Request, Response } from "express";
import { CustomError } from "@/types";
import { hashKey } from "@/utils";

export const verifyEmail = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { token } = req.params;
    const user = req.user as UserDocument;

    if (user.isEmailVerified) {
      const error = new Error() as CustomError;
      error.message = "Email is already verified.";
      error.statusCode = 400;
      throw error;
    }

    if (typeof token !== "string") {
      return res.status(400).json({
        message: "Invalid token format",
        success: false,
      });
    }

    const hashedOtp = hashKey(token);
    if (user.emailVerificationToken !== hashedOtp) {
      return res.status(400).json({
        message: "Invalid or expired token",
        success: false,
      });
    }
    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.otpLastSentAt = undefined;
    user.otpAttempts = 0;

    await user.save();

    res.status(200).json({
      message: "Email verified successfully",
      success: true,
    });
  } catch (error) {
    next(error);
  }
};
