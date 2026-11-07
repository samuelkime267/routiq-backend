import { FRONTEND_URL } from "@/config/env";
import { sendMail } from "@/lib/mail/mailer";
import { passwordResetTemplate } from "@/lib/mail/template";
import User from "@/models/user.model";
import { ResetPasswordSchemaType } from "@/schemas/auth";
import { CustomError } from "@/types/customError";
import { generateToken } from "@/utils";
import { NextFunction, Request, Response } from "express";

export const sendResetPasswordLink = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email } = req.body as ResetPasswordSchemaType;
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      const error = new Error() as CustomError;
      error.message = "User not found";
      error.statusCode = 404;
      throw error;
    }

    if (user.authProvider !== "local") {
      const error = new Error() as CustomError;
      error.message = `Password reset is not available for ${user.authProvider} accounts.`;
      error.statusCode = 400;
      throw error;
    }

    const { otpLastSentAt } = user;

    const now = new Date();

    if (
      otpLastSentAt &&
      otpLastSentAt > new Date(now.getTime() - 1 * 60 * 1000)
    ) {
      const error = new Error() as CustomError;
      error.message = "You can only request a new OTP once every minute.";
      error.statusCode = 429;
      throw error;
    }

    if (
      otpLastSentAt &&
      otpLastSentAt < new Date(now.getTime() - 15 * 60 * 1000)
    ) {
      user.otpAttempts = 0;
    }

    if (user.otpAttempts >= 5) {
      const error = new Error() as CustomError;
      error.message = "Too many OTP requests. Please try again later.";
      error.statusCode = 429;
      throw error;
    }

    const { token, hashedToken, expiresAt } = generateToken();

    user.passwordResetToken = hashedToken;
    user.passwordResetTokenExpiryDate = expiresAt;
    user.otpAttempts = user.otpAttempts + 1;
    user.otpLastSentAt = now;

    await user.save();

    const { html, text } = passwordResetTemplate(
      `${FRONTEND_URL}/reset-password/${token}`,
    );

    await sendMail({
      to: user.email,
      subject: "Reset your Routiq password",
      html,
      text,
    });

    res.status(200).json({
      message: "Password reset link sent successfully",
      success: true,
    });
  } catch (error) {
    next(error);
  }
};
