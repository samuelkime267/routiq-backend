import type { NextFunction, Request, Response } from "express";
import { ADMIN_URL } from "@/config/env";
import { sendMail } from "@/lib/mail/mailer";
import { adminPasswordResetTemplate } from "@/lib/mail/template";
import User from "@/models/user.model";
import type { ResetPasswordSchemaType } from "@/schemas/auth";
import { createError } from "@/utils/createError";
import { generateToken } from "@/utils";

const GENERIC_MESSAGE =
  "If an admin account exists for that email, a password reset link has been sent.";

export const adminForgotPassword = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email } = req.body as ResetPasswordSchemaType;
    const user = await User.findOne({ email: email.toLowerCase() });

    // Do not reveal whether an administrative account exists.
    if (!user || user.role !== "admin" || !user.adminRole) {
      return res.status(200).json({
        message: GENERIC_MESSAGE,
        success: true,
      });
    }

    // Suspended and deactivated admins cannot regain access through this flow.
    if (user.adminStatus === "SUSPENDED" || user.adminStatus === "DEACTIVATED") {
      return res.status(200).json({
        message: GENERIC_MESSAGE,
        success: true,
      });
    }

    const now = new Date();
    const { otpLastSentAt } = user;

    if (
      otpLastSentAt &&
      otpLastSentAt > new Date(now.getTime() - 1 * 60 * 1000)
    ) {
      throw createError(
        "You can only request a new reset link once every minute.",
        429,
      );
    }

    if (
      otpLastSentAt &&
      otpLastSentAt < new Date(now.getTime() - 15 * 60 * 1000)
    ) {
      user.otpAttempts = 0;
    }

    if (user.otpAttempts >= 5) {
      throw createError(
        "Too many reset requests. Please try again later.",
        429,
      );
    }

    const { token, hashedToken, expiresAt } = generateToken();

    user.passwordResetToken = hashedToken;
    user.passwordResetTokenExpiryDate = expiresAt;
    user.otpAttempts = (user.otpAttempts ?? 0) + 1;
    user.otpLastSentAt = now;

    await user.save();

    const { html, text } = adminPasswordResetTemplate(
      `${ADMIN_URL}/reset-password/${token}`,
    );

    await sendMail({
      to: user.email,
      subject: "Reset your Routiq admin password",
      html,
      text,
    });

    res.status(200).json({
      message: GENERIC_MESSAGE,
      success: true,
    });
  } catch (error) {
    next(error);
  }
};
